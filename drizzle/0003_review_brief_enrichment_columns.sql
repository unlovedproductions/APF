SET @db := DATABASE();
--> statement-breakpoint
SET @sql := (SELECT IF(
	(SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'product_review_briefs' AND COLUMN_NAME = 'recommended_content_style') = 0,
	'ALTER TABLE `product_review_briefs` ADD COLUMN `recommended_content_style` text',
	'SELECT 1'
));
--> statement-breakpoint
PREPARE _stmt FROM @sql;
--> statement-breakpoint
EXECUTE _stmt;
--> statement-breakpoint
DEALLOCATE PREPARE _stmt;
--> statement-breakpoint
SET @sql := (SELECT IF(
	(SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'product_review_briefs' AND COLUMN_NAME = 'suggested_competitors') = 0,
	'ALTER TABLE `product_review_briefs` ADD COLUMN `suggested_competitors` json',
	'SELECT 1'
));
--> statement-breakpoint
PREPARE _stmt FROM @sql;
--> statement-breakpoint
EXECUTE _stmt;
--> statement-breakpoint
DEALLOCATE PREPARE _stmt;
--> statement-breakpoint
SET @sql := (SELECT IF(
	(SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'product_review_briefs' AND COLUMN_NAME = 'price_display') = 0,
	'ALTER TABLE `product_review_briefs` ADD COLUMN `price_display` text',
	'SELECT 1'
));
--> statement-breakpoint
PREPARE _stmt FROM @sql;
--> statement-breakpoint
EXECUTE _stmt;
--> statement-breakpoint
DEALLOCATE PREPARE _stmt;
