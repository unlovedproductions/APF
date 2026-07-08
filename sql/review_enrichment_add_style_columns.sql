-- Migration: add ShadowCast style fields to product_review_briefs
ALTER TABLE product_review_briefs
  ADD COLUMN recommended_content_style TEXT NULL AFTER cta_guidance,
  ADD COLUMN suggested_competitors JSON NULL AFTER recommended_content_style,
  ADD COLUMN price_display TEXT NULL AFTER suggested_competitors;
