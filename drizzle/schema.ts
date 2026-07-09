import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean, json, unique } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Stores WarriorPlus API credentials per user
 */
export const apiCredentials = mysqlTable("api_credentials", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  platform: varchar("platform", { length: 32 }).notNull(), // "warriorplus" or "digistore24"
  apiKey: text("apiKey").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ApiCredential = typeof apiCredentials.$inferSelect;
export type InsertApiCredential = typeof apiCredentials.$inferInsert;

/**
 * Cached WarriorPlus products with calculated hidden gem scores
 */
export const products = mysqlTable("products", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  platform: varchar("platform", { length: 32 }).notNull(), // "warriorplus" or "digistore24"
  platformProductId: varchar("platformProductId", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  vendor: varchar("vendor", { length: 255 }),
  category: varchar("category", { length: 255 }),
  keywords: text("keywords"), // JSON array of keywords
  description: text("description"),
  
  // Sales metrics
  saleCount: int("saleCount").default(0),
  aggregateSales: decimal("aggregateSales", { precision: 12, scale: 2 }).default("0"),
  refundCount: int("refundCount").default(0),
  
  // Affiliate info
  commissionRate: decimal("commissionRate", { precision: 5, scale: 2 }), // percentage
  conversionRate: decimal("conversionRate", { precision: 5, scale: 2 }),
  cartValue: decimal("cartValue", { precision: 12, scale: 2 }),
  commissionType: varchar("commissionType", { length: 32 }), // "fixed" or "percentage"
  affiliateLink: text("affiliateLink"),
  
  // Scoring & metadata
  hiddenGemScore: decimal("hiddenGemScore", { precision: 5, scale: 2 }).default("0"),
  scoreComponents: text("scoreComponents"), // JSON: { recency, growth, competition, quality }
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  platformCreatedAt: timestamp("platformCreatedAt"),
  lastUpdatedAt: timestamp("lastUpdatedAt").defaultNow().onUpdateNow().notNull(),
  
  // For tracking data freshness
  dataFetchedAt: timestamp("dataFetchedAt").defaultNow().notNull(),
}, (table) => ({
  userPlatformProductUnique: unique("products_user_platform_product_unique").on(table.userId, table.platform, table.platformProductId),
}));

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

/**
 * User bookmarks/favorites for products
 */
export const bookmarks = mysqlTable("bookmarks", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  productId: int("productId").notNull(),
  notes: text("notes"),
  status: mysqlEnum("status", ["interested", "researching", "promoting", "archived"]).default("interested").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userProductBookmarkUnique: unique("bookmarks_user_product_unique").on(table.userId, table.productId),
}));

export type Bookmark = typeof bookmarks.$inferSelect;
export type InsertBookmark = typeof bookmarks.$inferInsert;

/**
 * Tracks data refresh history for each user
 */
export const dataRefreshLog = mysqlTable("data_refresh_log", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  platform: varchar("platform", { length: 32 }).notNull(),
  status: mysqlEnum("status", ["pending", "success", "failed"]).notNull(),
  productsCount: int("productsCount").default(0),
  errorMessage: text("errorMessage"),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type DataRefreshLog = typeof dataRefreshLog.$inferSelect;
export type InsertDataRefreshLog = typeof dataRefreshLog.$inferInsert;

/**
 * Canonical affiliate links per product/provider.
 */
export const productAffiliateLinks = mysqlTable("product_affiliate_links", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("product_id").notNull(),
  provider: varchar("provider", { length: 32 }).notNull(),
  affiliateNickname: varchar("affiliate_nickname", { length: 100 }).notNull(),
  vendorNickname: varchar("vendor_nickname", { length: 100 }),
  platformProductId: varchar("platform_product_id", { length: 100 }),
  affiliateUrl: text("affiliate_url").notNull(),
  campaignKey: varchar("campaign_key", { length: 120 }),
  status: varchar("status", { length: 32 }).default("generated").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  productProviderAffiliateUnique: unique("uq_product_provider_affiliate").on(table.productId, table.provider, table.affiliateNickname),
}));

export type ProductAffiliateLink = typeof productAffiliateLinks.$inferSelect;
export type InsertProductAffiliateLink = typeof productAffiliateLinks.$inferInsert;

/**
 * Review source rows collected from search/discovery.
 */
export const productReviewSources = mysqlTable("product_review_sources", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("product_id").notNull(),
  sourceType: varchar("source_type", { length: 32 }).notNull(),
  sourceName: varchar("source_name", { length: 255 }),
  title: text("title"),
  url: varchar("url", { length: 2048 }).notNull(),
  snippet: text("snippet"),
  publishedAt: timestamp("published_at"),
  discoveredAt: timestamp("discovered_at").defaultNow().notNull(),
  relevanceScore: decimal("relevance_score", { precision: 5, scale: 2 }),
  trustScore: decimal("trust_score", { precision: 5, scale: 2 }),
  sentiment: varchar("sentiment", { length: 32 }),
  rawJson: json("raw_json"),
}, (table) => ({
  productReviewUrlUnique: unique("uq_product_review_url").on(table.productId, table.url),
}));

export type ProductReviewSource = typeof productReviewSources.$inferSelect;
export type InsertProductReviewSource = typeof productReviewSources.$inferInsert;

/**
 * Summarized review brief generated per product.
 */
export const productReviewBriefs = mysqlTable("product_review_briefs", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("product_id").notNull(),
  enrichmentStatus: varchar("enrichment_status", { length: 32 }).default("pending").notNull(),
  reviewSummary: text("review_summary"),
  positiveSignals: json("positive_signals"),
  negativeSignals: json("negative_signals"),
  commonClaims: json("common_claims"),
  commonComplaints: json("common_complaints"),
  targetAudience: text("target_audience"),
  whoItMayHelp: text("who_it_may_help"),
  whoShouldSkipIt: text("who_should_skip_it"),
  bestVideoAngles: json("best_video_angles"),
  ctaGuidance: text("cta_guidance"),
  recommendedContentStyle: text("recommended_content_style"),
  suggestedCompetitors: json("suggested_competitors"),
  priceDisplay: text("price_display"),
  sourceCount: int("source_count").default(0).notNull(),
  confidenceScore: decimal("confidence_score", { precision: 5, scale: 2 }),
  errorMessage: text("error_message"),
  generatedAt: timestamp("generated_at"),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  reviewBriefPerProductUnique: unique("uq_review_brief_product").on(table.productId),
}));

export type ProductReviewBrief = typeof productReviewBriefs.$inferSelect;
export type InsertProductReviewBrief = typeof productReviewBriefs.$inferInsert;

/**
 * Queue table for review enrichment jobs.
 */
export const reviewEnrichmentJobs = mysqlTable("review_enrichment_jobs", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("product_id").notNull(),
  status: varchar("status", { length: 32 }).default("queued").notNull(),
  attempts: int("attempts").default(0).notNull(),
  nextRunAt: timestamp("next_run_at").defaultNow().notNull(),
  lockedAt: timestamp("locked_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  reviewJobPerProductUnique: unique("uq_review_job_product").on(table.productId),
}));

export type ReviewEnrichmentJob = typeof reviewEnrichmentJobs.$inferSelect;
export type InsertReviewEnrichmentJob = typeof reviewEnrichmentJobs.$inferInsert;

/**
 * Vendor-hosted sales/marketing material captured during Digistore24 ingestion.
 */
export const productVendorMaterials = mysqlTable("product_vendor_materials", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("product_id").notNull(),
  sourceUrl: text("source_url").notNull(),
  sourceUrlHash: varchar("source_url_hash", { length: 64 }).notNull(),
  sourceType: varchar("source_type", { length: 64 }).notNull(),
  domain: varchar("domain", { length: 255 }),
  title: text("title"),
  contentText: text("content_text"),
  structuredBlocks: json("structured_blocks"),
  isVendorHosted: boolean("is_vendor_hosted").default(true).notNull(),
  fetchStatus: varchar("fetch_status", { length: 32 }).default("ok").notNull(),
  discoveredAt: timestamp("discovered_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  vendorMaterialProductUrlUnique: unique("uq_vendor_material_product_url").on(table.productId, table.sourceUrlHash),
}));

export type ProductVendorMaterial = typeof productVendorMaterials.$inferSelect;
export type InsertProductVendorMaterial = typeof productVendorMaterials.$inferInsert;
