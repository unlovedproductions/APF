ALTER TABLE `product_review_briefs`
	ADD COLUMN `recommended_content_style` text,
	ADD COLUMN `suggested_competitors` json,
	ADD COLUMN `price_display` text;
