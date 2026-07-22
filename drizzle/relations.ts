import { relations } from "drizzle-orm";
import {
  products,
  bookmarks,
  productAffiliateLinks,
  productReviewSources,
  productReviewBriefs,
  reviewEnrichmentJobs,
  productVendorMaterials,
} from "./schema";

export const productsRelations = relations(products, ({ many, one }) => ({
  affiliateLinks: many(productAffiliateLinks),
  reviewSources: many(productReviewSources),
  reviewBrief: one(productReviewBriefs),
  enrichmentJob: one(reviewEnrichmentJobs),
  vendorMaterials: many(productVendorMaterials),
  bookmarks: many(bookmarks),
}));

export const productAffiliateLinksRelations = relations(productAffiliateLinks, ({ one }) => ({
  product: one(products, {
    fields: [productAffiliateLinks.productId],
    references: [products.id],
  }),
}));

export const productReviewSourcesRelations = relations(productReviewSources, ({ one }) => ({
  product: one(products, {
    fields: [productReviewSources.productId],
    references: [products.id],
  }),
}));

export const productReviewBriefsRelations = relations(productReviewBriefs, ({ one }) => ({
  product: one(products, {
    fields: [productReviewBriefs.productId],
    references: [products.id],
  }),
}));

export const reviewEnrichmentJobsRelations = relations(reviewEnrichmentJobs, ({ one }) => ({
  product: one(products, {
    fields: [reviewEnrichmentJobs.productId],
    references: [products.id],
  }),
}));

export const productVendorMaterialsRelations = relations(productVendorMaterials, ({ one }) => ({
  product: one(products, {
    fields: [productVendorMaterials.productId],
    references: [products.id],
  }),
}));

export const bookmarksRelations = relations(bookmarks, ({ one }) => ({
  product: one(products, {
    fields: [bookmarks.productId],
    references: [products.id],
  }),
}));
