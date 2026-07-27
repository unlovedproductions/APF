import { eq, and, desc, asc, like, inArray, or, sql, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, apiCredentials, products, bookmarks, dataRefreshLogs, productReviewBriefs } from "../drizzle/schema";
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

const UPSERT_BATCH_SIZE = 100;

function mapProductRow(userId: number, platform: string, product: any) {
  return {
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
    conversionRate: product.conversionRate,
    cartValue: product.cartValue,
    commissionType: product.commissionType,
    affiliateLink: product.affiliateLink,
    hiddenGemScore: product.hiddenGemScore || "0",
    scoreComponents: product.scoreComponents ? JSON.stringify(product.scoreComponents) : null,
    platformCreatedAt: product.platformCreatedAt,
    dataFetchedAt: new Date(),
  };
}

export async function upsertProducts(userId: number, platform: string, productsData: any[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (!productsData.length) return;

  for (let offset = 0; offset < productsData.length; offset += UPSERT_BATCH_SIZE) {
    const batch = productsData.slice(offset, offset + UPSERT_BATCH_SIZE);
    const rows = batch.map(product => mapProductRow(userId, platform, product));

    await db.insert(products)
      .values(rows)
      .onDuplicateKeyUpdate({
        set: {
          name: sql`values(${products.name})`,
          vendor: sql`values(${products.vendor})`,
          category: sql`values(${products.category})`,
          keywords: sql`values(${products.keywords})`,
          description: sql`values(${products.description})`,
          saleCount: sql`values(${products.saleCount})`,
          aggregateSales: sql`values(${products.aggregateSales})`,
          refundCount: sql`values(${products.refundCount})`,
          commissionRate: sql`values(${products.commissionRate})`,
          conversionRate: sql`values(${products.conversionRate})`,
          cartValue: sql`values(${products.cartValue})`,
          commissionType: sql`values(${products.commissionType})`,
          affiliateLink: sql`values(${products.affiliateLink})`,
          platformCreatedAt: sql`values(${products.platformCreatedAt})`,
          hiddenGemScore: sql`values(${products.hiddenGemScore})`,
          scoreComponents: sql`values(${products.scoreComponents})`,
          dataFetchedAt: sql`values(${products.dataFetchedAt})`,
        },
      });
  }
}

export async function getProductsByUser(userId: number, platform: string, limit: number = 100, offset: number = 0) {
  const db = await getDb();
  if (!db) return [];

  return db.select()
    .from(products)
    .where(and(
      eq(products.userId, userId),
      eq(products.platform, platform),
      isNull(products.deletedAt),
    ))
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
      isNull(products.deletedAt),
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
      isNull(products.deletedAt),
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

export async function getProductEnrichmentStatus(productId: number) {
  const db = await getDb();
  if (!db) return "pending";
  const rows = await db.select()
    .from(productReviewBriefs)
    .where(eq(productReviewBriefs.productId, productId))
    .limit(1);
  return rows[0]?.enrichmentStatus || "pending";
}

export async function getProductEnrichmentStatuses(productIds: number[]) {
  const db = await getDb();
  const statusById = new Map<number, string>();
  if (!db || !productIds.length) return statusById;

  const rows = await db.select({
    productId: productReviewBriefs.productId,
    enrichmentStatus: productReviewBriefs.enrichmentStatus,
  })
    .from(productReviewBriefs)
    .where(inArray(productReviewBriefs.productId, productIds));

  for (const row of rows) {
    statusById.set(row.productId, row.enrichmentStatus || "pending");
  }
  return statusById;
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

  await db.insert(dataRefreshLogs).values({
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
    .from(dataRefreshLogs)
    .where(and(eq(dataRefreshLogs.userId, userId), eq(dataRefreshLogs.platform, platform)))
    .orderBy(desc(dataRefreshLogs.completedAt))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}
