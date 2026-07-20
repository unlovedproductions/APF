CREATE TABLE `vendor_profiles` (
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
	`vendor_trust_score` decimal(5,2) NOT NULL DEFAULT '40',
	`vendor_risk_flags` json,
	`ranking_components` json,
	`last_enriched_at` timestamp,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vendor_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_vendor_profile_platform_name` UNIQUE(`platform`,`vendor_name_normalized`)
);
--> statement-breakpoint
CREATE INDEX `idx_products_user_platform_score` ON `products` (`userId`,`platform`,`hiddenGemScore`);
--> statement-breakpoint
CREATE INDEX `idx_products_user_platform_category` ON `products` (`userId`,`platform`,`category`);
--> statement-breakpoint
CREATE INDEX `idx_api_credentials_user_platform` ON `api_credentials` (`userId`,`platform`);
--> statement-breakpoint
CREATE INDEX `idx_bookmarks_user` ON `bookmarks` (`userId`);
--> statement-breakpoint
CREATE INDEX `idx_data_refresh_user_platform` ON `data_refresh_log` (`userId`,`platform`);
--> statement-breakpoint
CREATE INDEX `idx_product_affiliate_links_product` ON `product_affiliate_links` (`product_id`);
--> statement-breakpoint
CREATE INDEX `idx_product_affiliate_links_provider` ON `product_affiliate_links` (`provider`);
--> statement-breakpoint
CREATE INDEX `idx_product_affiliate_links_status` ON `product_affiliate_links` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_product_review_sources_product` ON `product_review_sources` (`product_id`);
--> statement-breakpoint
CREATE INDEX `idx_product_review_sources_type` ON `product_review_sources` (`source_type`);
--> statement-breakpoint
CREATE INDEX `idx_review_briefs_status` ON `product_review_briefs` (`enrichment_status`);
--> statement-breakpoint
CREATE INDEX `idx_review_briefs_confidence` ON `product_review_briefs` (`confidence_score`);
--> statement-breakpoint
CREATE INDEX `idx_review_jobs_queue` ON `review_enrichment_jobs` (`status`,`next_run_at`);
--> statement-breakpoint
CREATE INDEX `idx_vendor_materials_product` ON `product_vendor_materials` (`product_id`);
--> statement-breakpoint
CREATE INDEX `idx_vendor_materials_type` ON `product_vendor_materials` (`source_type`);
