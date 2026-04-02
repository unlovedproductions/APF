import { eq, and, desc, asc, like, inArray, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, apiCredentials, products, bookmarks, dataRefreshLog } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ============ API Credentials ============

export async function saveApiCredential(userId: number, platform: string, apiKey: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Deactivate existing credentials for this platform
  await db.update(apiCredentials)
    .set({ isActive: false })
    .where(and(eq(apiCredentials.userId, userId), eq(apiCredentials.platform, platform)));

  // Insert new credential
  await db.insert(apiCredentials).values({
    userId,
    platform,
    apiKey,
    isActive: true,
  });
}

export async function getActiveApiCredential(userId: number, platform: string) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select()
    .from(apiCredentials)
    .where(and(
      eq(apiCredentials.userId, userId),
      eq(apiCredentials.platform, platform),
      eq(apiCredentials.isActive, true)
    ))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

// ============ Products ============

export async function upsertProducts(userId: number, platform: string, productsData: any[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  for (const product of productsData) {
    await db.insert(products)
      .values({
        userId,
        platform,
        platformProductId: product.platformProductId,
        name: product.name,
        vendor: product.vendor,
        category: product.category,
        keywords: product.keywords ? JSON.stringify(product.keywords) : null,
        description: product.description,
        saleCount: product.saleCount || 0,
        aggregateSales: product.aggregateSales || "0",
        refundCount: product.refundCount || 0,
        commissionRate: product.commissionRate,
        commissionType: product.commissionType,
        affiliateLink: product.affiliateLink,
        hiddenGemScore: product.hiddenGemScore || "0",
        scoreComponents: product.scoreComponents ? JSON.stringify(product.scoreComponents) : null,
        platformCreatedAt: product.platformCreatedAt,
        dataFetchedAt: new Date(),
      })
      .onDuplicateKeyUpdate({
        set: {
          name: product.name,
          saleCount: product.saleCount || 0,
          aggregateSales: product.aggregateSales || "0",
          refundCount: product.refundCount || 0,
          hiddenGemScore: product.hiddenGemScore || "0",
          scoreComponents: product.scoreComponents ? JSON.stringify(product.scoreComponents) : null,
          dataFetchedAt: new Date(),
        },
      });
  }
}

export async function getProductsByUser(userId: number, platform: string, limit: number = 100, offset: number = 0) {
  const db = await getDb();
  if (!db) return [];

  return db.select()
    .from(products)
    .where(and(eq(products.userId, userId), eq(products.platform, platform)))
    .orderBy(desc(products.hiddenGemScore))
    .limit(limit)
    .offset(offset);
}

export async function searchProducts(userId: number, platform: string, query: string) {
  const db = await getDb();
  if (!db) return [];

  return db.select()
    .from(products)
    .where(and(
      eq(products.userId, userId),
      eq(products.platform, platform),
      // Search across name, vendor, and keywords
      or(
        like(products.name, `%${query}%`),
        like(products.vendor || '', `%${query}%`),
        like(products.keywords || '', `%${query}%`),
        like(products.description || '', `%${query}%`)
      )
    ))
    .orderBy(desc(products.hiddenGemScore))
    .limit(50);
}

export async function getProductsByCategory(userId: number, platform: string, category: string) {
  const db = await getDb();
  if (!db) return [];

  return db.select()
    .from(products)
    .where(and(
      eq(products.userId, userId),
      eq(products.platform, platform),
      like(products.category, `%${category}%`)
    ))
    .orderBy(desc(products.hiddenGemScore))
    .limit(100);
}

export async function getProductById(productId: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select()
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

// ============ Bookmarks ============

export async function addBookmark(userId: number, productId: number, notes?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(bookmarks).values({
    userId,
    productId,
    notes,
    status: "interested",
  });
}

export async function removeBookmark(userId: number, productId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(bookmarks)
    .where(and(eq(bookmarks.userId, userId), eq(bookmarks.productId, productId)));
}

export async function getBookmarks(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return db.select()
    .from(bookmarks)
    .where(eq(bookmarks.userId, userId))
    .orderBy(desc(bookmarks.createdAt));
}

export async function updateBookmarkStatus(userId: number, productId: number, status: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(bookmarks)
    .set({ status: status as any })
    .where(and(eq(bookmarks.userId, userId), eq(bookmarks.productId, productId)));
}

export async function isProductBookmarked(userId: number, productId: number) {
  const db = await getDb();
  if (!db) return false;

  const result = await db.select()
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, userId), eq(bookmarks.productId, productId)))
    .limit(1);

  return result.length > 0;
}

// ============ Data Refresh Log ============

export async function logDataRefresh(userId: number, platform: string, status: string, productsCount: number = 0, errorMessage?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(dataRefreshLog).values({
    userId,
    platform,
    status: status as any,
    productsCount,
    errorMessage,
    completedAt: new Date(),
  });
}

export async function getLastRefreshLog(userId: number, platform: string) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select()
    .from(dataRefreshLog)
    .where(and(eq(dataRefreshLog.userId, userId), eq(dataRefreshLog.platform, platform)))
    .orderBy(desc(dataRefreshLog.completedAt))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}
