-- FK constraints + NOT NULL fixes from docs/database/schema_analysis.json

ALTER TABLE `bookmarks` MODIFY `status` varchar(32) NOT NULL DEFAULT 'active';
--> statement-breakpoint
ALTER TABLE `review_enrichment_jobs` MODIFY `status` varchar(32) NOT NULL DEFAULT 'queued';
--> statement-breakpoint
SET @db := DATABASE();
--> statement-breakpoint
SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = @db AND table_name = 'product_affiliate_links' AND constraint_name = 'fk_pal_product_id') = 0,
  'ALTER TABLE `product_affiliate_links` ADD CONSTRAINT `fk_pal_product_id` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE',
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
  (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = @db AND table_name = 'product_review_sources' AND constraint_name = 'fk_prs_product_id') = 0,
  'ALTER TABLE `product_review_sources` ADD CONSTRAINT `fk_prs_product_id` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE',
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
  (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = @db AND table_name = 'product_review_briefs' AND constraint_name = 'fk_prb_product_id') = 0,
  'ALTER TABLE `product_review_briefs` ADD CONSTRAINT `fk_prb_product_id` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE',
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
  (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = @db AND table_name = 'review_enrichment_jobs' AND constraint_name = 'fk_rej_product_id') = 0,
  'ALTER TABLE `review_enrichment_jobs` ADD CONSTRAINT `fk_rej_product_id` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE',
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
  (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = @db AND table_name = 'product_vendor_materials' AND constraint_name = 'fk_pvm_product_id') = 0,
  'ALTER TABLE `product_vendor_materials` ADD CONSTRAINT `fk_pvm_product_id` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE',
  'SELECT 1'
));
--> statement-breakpoint
PREPARE _stmt FROM @sql;
--> statement-breakpoint
EXECUTE _stmt;
--> statement-breakpoint
DEALLOCATE PREPARE _stmt;
