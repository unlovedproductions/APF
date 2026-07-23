SET @db := DATABASE();
--> statement-breakpoint
SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = @db AND table_name = 'products' AND column_name = 'conversionRate') = 0,
  'ALTER TABLE `products` ADD COLUMN `conversionRate` decimal(5,2)',
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
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = @db AND table_name = 'products' AND column_name = 'cartValue') = 0,
  'ALTER TABLE `products` ADD COLUMN `cartValue` decimal(12,2)',
  'SELECT 1'
));
--> statement-breakpoint
PREPARE _stmt FROM @sql;
--> statement-breakpoint
EXECUTE _stmt;
--> statement-breakpoint
DEALLOCATE PREPARE _stmt;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `product_affiliate_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`product_id` int NOT NULL,
	`provider` varchar(32) NOT NULL,
	`affiliate_nickname` varchar(100) NOT NULL,
	`vendor_nickname` varchar(100),
	`platform_product_id` varchar(100),
	`affiliate_url` text NOT NULL,
	`campaign_key` varchar(120),
	`status` varchar(32) NOT NULL DEFAULT 'generated',
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `product_affiliate_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_product_provider_affiliate` UNIQUE(`product_id`,`provider`,`affiliate_nickname`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `product_review_sources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`product_id` int NOT NULL,
	`source_type` varchar(32) NOT NULL,
	`source_name` varchar(255),
	`title` text,
	`url` varchar(2048) NOT NULL,
	`snippet` text,
	`published_at` timestamp,
	`discovered_at` timestamp NOT NULL DEFAULT (now()),
	`relevance_score` decimal(5,2),
	`trust_score` decimal(5,2),
	`sentiment` varchar(32),
	`raw_json` json,
	CONSTRAINT `product_review_sources_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_product_review_url` UNIQUE(`product_id`,`url`(512))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `product_review_briefs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`product_id` int NOT NULL,
	`enrichment_status` varchar(32) NOT NULL DEFAULT 'pending',
	`review_summary` text,
	`positive_signals` json,
	`negative_signals` json,
	`common_claims` json,
	`common_complaints` json,
	`target_audience` text,
	`who_it_may_help` text,
	`who_should_skip_it` text,
	`best_video_angles` json,
	`cta_guidance` text,
	`recommended_content_style` text,
	`suggested_competitors` json,
	`price_display` text,
	`source_count` int NOT NULL DEFAULT 0,
	`confidence_score` decimal(5,2),
	`error_message` text,
	`generated_at` timestamp,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `product_review_briefs_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_review_brief_product` UNIQUE(`product_id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `review_enrichment_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`product_id` int NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'queued',
	`attempts` int NOT NULL DEFAULT 0,
	`next_run_at` timestamp NOT NULL DEFAULT (now()),
	`locked_at` timestamp,
	`error_message` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `review_enrichment_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_review_job_product` UNIQUE(`product_id`)
);
--> statement-breakpoint
SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = @db AND table_name = 'products' AND index_name = 'products_user_platform_product_unique') = 0,
  'CREATE UNIQUE INDEX `products_user_platform_product_unique` ON `products` (`userId`,`platform`,`platformProductId`)',
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
  (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = @db AND table_name = 'bookmarks' AND index_name = 'bookmarks_user_product_unique') = 0,
  'CREATE UNIQUE INDEX `bookmarks_user_product_unique` ON `bookmarks` (`userId`,`productId`)',
  'SELECT 1'
));
--> statement-breakpoint
PREPARE _stmt FROM @sql;
--> statement-breakpoint
EXECUTE _stmt;
--> statement-breakpoint
DEALLOCATE PREPARE _stmt;
