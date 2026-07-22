-- Deferred schema: soft deletes, FULLTEXT search, data_refresh_logs rename

SET @db := DATABASE();
--> statement-breakpoint
SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = @db AND table_name = 'products' AND column_name = 'deletedAt') = 0,
  'ALTER TABLE `products` ADD COLUMN `deletedAt` timestamp NULL',
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
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = @db AND table_name = 'bookmarks' AND column_name = 'deletedAt') = 0,
  'ALTER TABLE `bookmarks` ADD COLUMN `deletedAt` timestamp NULL',
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
  (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = @db AND table_name = 'products' AND index_name = 'idx_products_fulltext') = 0,
  'CREATE FULLTEXT INDEX `idx_products_fulltext` ON `products` (`name`, `vendor`, `description`)',
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
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = @db AND table_name = 'data_refresh_log') > 0
  AND (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = @db AND table_name = 'data_refresh_logs') = 0,
  'RENAME TABLE `data_refresh_log` TO `data_refresh_logs`',
  'SELECT 1'
));
--> statement-breakpoint
PREPARE _stmt FROM @sql;
--> statement-breakpoint
EXECUTE _stmt;
--> statement-breakpoint
DEALLOCATE PREPARE _stmt;
