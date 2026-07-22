-- FK constraints + NOT NULL fixes from docs/database/schema_analysis.json

SET @db := DATABASE();
--> statement-breakpoint
SET @sql := (SELECT IF(
  (SELECT IS_NULLABLE FROM information_schema.columns WHERE table_schema = @db AND table_name = 'bookmarks' AND column_name = 'status') = 'YES',
  'ALTER TABLE `bookmarks` MODIFY `status` enum(''interested'',''researching'',''promoting'',''archived'') NOT NULL DEFAULT ''interested''',
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
  (SELECT IS_NULLABLE FROM information_schema.columns WHERE table_schema = @db AND table_name = 'review_enrichment_jobs' AND column_name = 'status') = 'YES',
  'ALTER TABLE `review_enrichment_jobs` MODIFY `status` varchar(32) NOT NULL DEFAULT ''queued''',
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
  (SELECT COLUMN_TYPE FROM information_schema.columns WHERE table_schema = @db AND table_name = 'product_affiliate_links' AND column_name = 'product_id') != 'int',
  'ALTER TABLE `product_affiliate_links` MODIFY `product_id` int NOT NULL',
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
  (SELECT COLUMN_TYPE FROM information_schema.columns WHERE table_schema = @db AND table_name = 'product_review_sources' AND column_name = 'product_id') != 'int',
  'ALTER TABLE `product_review_sources` MODIFY `product_id` int NOT NULL',
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
  (SELECT COLUMN_TYPE FROM information_schema.columns WHERE table_schema = @db AND table_name = 'product_review_briefs' AND column_name = 'product_id') != 'int',
  'ALTER TABLE `product_review_briefs` MODIFY `product_id` int NOT NULL',
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
  (SELECT COLUMN_TYPE FROM information_schema.columns WHERE table_schema = @db AND table_name = 'review_enrichment_jobs' AND column_name = 'product_id') != 'int',
  'ALTER TABLE `review_enrichment_jobs` MODIFY `product_id` int NOT NULL',
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
  (SELECT COLUMN_TYPE FROM information_schema.columns WHERE table_schema = @db AND table_name = 'product_vendor_materials' AND column_name = 'product_id') != 'int',
  'ALTER TABLE `product_vendor_materials` MODIFY `product_id` int NOT NULL',
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
