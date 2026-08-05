import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean, json, unique, index, foreignKey } from "drizzle-orm/mysql-core";

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
}, (table) => ({
  userPlatformIdx: index("idx_api_credentials_user_platform").on(table.userId, table.platform),
}));

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
  deletedAt: timestamp("deletedAt"),
}, (table) => ({
  userPlatformProductUnique: unique("products_user_platform_product_unique").on(table.userId, table.platform, table.platformProductId),
  userPlatformScoreIdx: index("idx_products_user_platform_score").on(table.userId, table.platform, table.hiddenGemScore),
  userPlatformCategoryIdx: index("idx_products_user_platform_category").on(table.userId, table.platform, table.category),
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
  deletedAt: timestamp("deletedAt"),
}, (table) => ({
  userProductBookmarkUnique: unique("bookmarks_user_product_unique").on(table.userId, table.productId),
  userIdx: index("idx_bookmarks_user").on(table.userId),
}));

export type Bookmark = typeof bookmarks.$inferSelect;
export type InsertBookmark = typeof bookmarks.$inferInsert;

/**
 * Tracks data refresh history for each user
 */
export const dataRefreshLogs = mysqlTable("data_refresh_logs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  platform: varchar("platform", { length: 32 }).notNull(),
  status: mysqlEnum("status", ["pending", "success", "failed"]).notNull(),
  productsCount: int("productsCount").default(0),
  errorMessage: text("errorMessage"),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
}, (table) => ({
  userPlatformIdx: index("idx_data_refresh_user_platform").on(table.userId, table.platform),
}));

export type DataRefreshLog = typeof dataRefreshLogs.$inferSelect;
export type InsertDataRefreshLog = typeof dataRefreshLogs.$inferInsert;

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
  productIdx: index("idx_product_affiliate_links_product").on(table.productId),
  providerIdx: index("idx_product_affiliate_links_provider").on(table.provider),
  statusIdx: index("idx_product_affiliate_links_status").on(table.status),
  productFk: foreignKey({
    name: "fk_pal_product_id",
    columns: [table.productId],
    foreignColumns: [products.id],
  }).onDelete("cascade"),
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
  productIdx: index("idx_product_review_sources_product").on(table.productId),
  sourceTypeIdx: index("idx_product_review_sources_type").on(table.sourceType),
  productFk: foreignKey({
    name: "fk_prs_product_id",
    columns: [table.productId],
    foreignColumns: [products.id],
  }).onDelete("cascade"),
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
  priceComparison: text("price_comparison"),
  seriesName: text("series_name"),
  couponCode: text("coupon_code"),
  evidenceCoverage: json("evidence_coverage"),
  sourceCount: int("source_count").default(0).notNull(),
  confidenceScore: decimal("confidence_score", { precision: 5, scale: 2 }),
  errorMessage: text("error_message"),
  generatedAt: timestamp("generated_at"),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  reviewBriefPerProductUnique: unique("uq_review_brief_product").on(table.productId),
  statusIdx: index("idx_review_briefs_status").on(table.enrichmentStatus),
  confidenceIdx: index("idx_review_briefs_confidence").on(table.confidenceScore),
  productFk: foreignKey({
    name: "fk_prb_product_id",
    columns: [table.productId],
    foreignColumns: [products.id],
  }).onDelete("cascade"),
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
  queueIdx: index("idx_review_jobs_queue").on(table.status, table.nextRunAt),
  productFk: foreignKey({
    name: "fk_rej_product_id",
    columns: [table.productId],
    foreignColumns: [products.id],
  }).onDelete("cascade"),
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
  productIdx: index("idx_vendor_materials_product").on(table.productId),
  sourceTypeIdx: index("idx_vendor_materials_type").on(table.sourceType),
  productFk: foreignKey({
    name: "fk_pvm_product_id",
    columns: [table.productId],
    foreignColumns: [products.id],
  }).onDelete("cascade"),
}));

export type ProductVendorMaterial = typeof productVendorMaterials.$inferSelect;
export type InsertProductVendorMaterial = typeof productVendorMaterials.$inferInsert;

/**
 * Platform-scoped vendor evidence and trust ranking.
 */
export const vendorProfiles = mysqlTable("vendor_profiles", {
  id: int("id").autoincrement().primaryKey(),
  platform: varchar("platform", { length: 32 }).notNull(),
  vendorName: varchar("vendor_name", { length: 255 }).notNull(),
  vendorNameNormalized: varchar("vendor_name_normalized", { length: 255 }).notNull(),
  bbbSignals: json("bbb_signals"),
  trustpilotSignals: json("trustpilot_signals"),
  scamAdvisorSignals: json("scam_advisor_signals"),
  reviewSignals: json("review_signals"),
  complaintSignals: json("complaint_signals"),
  sourceCount: int("source_count").default(0).notNull(),
  vendorTrustScore: decimal("vendor_trust_score", { precision: 5, scale: 2 }).default("40").notNull(),
  vendorRiskFlags: json("vendor_risk_flags"),
  rankingComponents: json("ranking_components"),
  lastEnrichedAt: timestamp("last_enriched_at"),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  vendorProfilePlatformNameUnique: unique("uq_vendor_profile_platform_name").on(table.platform, table.vendorNameNormalized),
}));

export type VendorProfile = typeof vendorProfiles.$inferSelect;
export type InsertVendorProfile = typeof vendorProfiles.$inferInsert;

/**
 * Manual / bookmark-driven promote outcomes for Hidden Gem calibration (P1.3).
 */
export const productPromoteOutcomes = mysqlTable("product_promote_outcomes", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  productId: int("product_id").notNull(),
  event: varchar("event", { length: 32 }).notNull(),
  netEpc: decimal("net_epc", { precision: 12, scale: 4 }),
  refundRate: decimal("refund_rate", { precision: 5, scale: 2 }),
  hiddenGemScore: decimal("hidden_gem_score", { precision: 8, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  productIdx: index("idx_promote_outcomes_product").on(table.productId),
  userIdx: index("idx_promote_outcomes_user").on(table.userId),
  eventIdx: index("idx_promote_outcomes_event").on(table.event),
}));

export type ProductPromoteOutcome = typeof productPromoteOutcomes.$inferSelect;
export type InsertProductPromoteOutcome = typeof productPromoteOutcomes.$inferInsert;
