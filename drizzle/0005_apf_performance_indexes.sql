SET @db := DATABASE();
--> statement-breakpoint
SET @sql := (SELECT IF(
	(SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = @db AND table_name = 'vendor_profiles') = 0,
	'CREATE TABLE `vendor_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`platform` varchar(32) NOT NULL,
	`vendor_name` varchar(255) NOT NULL,
	`vendor_name_normalized` varchar(255) NOT NULL,
	`bbb_signals` json,
	`trustpilot_signals` json,
	`scam_advisor_signals` json,
	`review_signals` json,
	`complaint_signals` json,
	`source_count` int NOT NULL DEFAULT 0,
	`vendor_trust_score` decimal(5,2) NOT NULL DEFAULT ''40'',
	`vendor_risk_flags` json,
	`ranking_components` json,
	`last_enriched_at` timestamp,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vendor_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_vendor_profile_platform_name` UNIQUE(`platform`,`vendor_name_normalized`)
)',
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
	(SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = @db AND table_name = 'products' AND index_name = 'idx_products_user_platform_score') = 0,
	'CREATE INDEX `idx_products_user_platform_score` ON `products` (`userId`,`platform`,`hiddenGemScore`)',
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
	(SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = @db AND table_name = 'products' AND index_name = 'idx_products_user_platform_category') = 0,
	'CREATE INDEX `idx_products_user_platform_category` ON `products` (`userId`,`platform`,`category`)',
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
	(SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = @db AND table_name = 'api_credentials' AND index_name = 'idx_api_credentials_user_platform') = 0,
	'CREATE INDEX `idx_api_credentials_user_platform` ON `api_credentials` (`userId`,`platform`)',
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
	(SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = @db AND table_name = 'bookmarks' AND index_name = 'idx_bookmarks_user') = 0,
	'CREATE INDEX `idx_bookmarks_user` ON `bookmarks` (`userId`)',
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
	(SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = @db AND table_name = 'data_refresh_log' AND index_name = 'idx_data_refresh_user_platform') = 0,
	'CREATE INDEX `idx_data_refresh_user_platform` ON `data_refresh_log` (`userId`,`platform`)',
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
	(SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = @db AND table_name = 'product_affiliate_links' AND index_name = 'idx_product_affiliate_links_product') = 0,
	'CREATE INDEX `idx_product_affiliate_links_product` ON `product_affiliate_links` (`product_id`)',
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
	(SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = @db AND table_name = 'product_affiliate_links' AND index_name = 'idx_product_affiliate_links_provider') = 0,
	'CREATE INDEX `idx_product_affiliate_links_provider` ON `product_affiliate_links` (`provider`)',
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
	(SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = @db AND table_name = 'product_affiliate_links' AND index_name = 'idx_product_affiliate_links_status') = 0,
	'CREATE INDEX `idx_product_affiliate_links_status` ON `product_affiliate_links` (`status`)',
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
	(SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = @db AND table_name = 'product_review_sources' AND index_name = 'idx_product_review_sources_product') = 0,
	'CREATE INDEX `idx_product_review_sources_product` ON `product_review_sources` (`product_id`)',
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
	(SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = @db AND table_name = 'product_review_sources' AND index_name = 'idx_product_review_sources_type') = 0,
	'CREATE INDEX `idx_product_review_sources_type` ON `product_review_sources` (`source_type`)',
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
	(SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = @db AND table_name = 'product_review_briefs' AND index_name = 'idx_review_briefs_status') = 0,
	'CREATE INDEX `idx_review_briefs_status` ON `product_review_briefs` (`enrichment_status`)',
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
	(SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = @db AND table_name = 'product_review_briefs' AND index_name = 'idx_review_briefs_confidence') = 0,
	'CREATE INDEX `idx_review_briefs_confidence` ON `product_review_briefs` (`confidence_score`)',
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
	(SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = @db AND table_name = 'review_enrichment_jobs' AND index_name = 'idx_review_jobs_queue') = 0,
	'CREATE INDEX `idx_review_jobs_queue` ON `review_enrichment_jobs` (`status`,`next_run_at`)',
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
	(SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = @db AND table_name = 'product_vendor_materials' AND index_name = 'idx_vendor_materials_product') = 0,
	'CREATE INDEX `idx_vendor_materials_product` ON `product_vendor_materials` (`product_id`)',
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
	(SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = @db AND table_name = 'product_vendor_materials' AND index_name = 'idx_vendor_materials_type') = 0,
	'CREATE INDEX `idx_vendor_materials_type` ON `product_vendor_materials` (`source_type`)',
	'SELECT 1'
));
--> statement-breakpoint
PREPARE _stmt FROM @sql;
--> statement-breakpoint
EXECUTE _stmt;
--> statement-breakpoint
DEALLOCATE PREPARE _stmt;
