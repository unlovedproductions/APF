import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean, json } from "drizzle-orm/mysql-core";

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
});

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
});

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
