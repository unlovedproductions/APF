SET @db := DATABASE();
--> statement-breakpoint
SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = @db AND table_name = 'product_review_briefs' AND column_name = 'claim_ledger') = 0,
  'ALTER TABLE `product_review_briefs` ADD COLUMN `claim_ledger` json',
  'SELECT 1'
));
--> statement-breakpoint
PREPARE _stmt FROM @sql;
--> statement-breakpoint
EXECUTE _stmt;
--> statement-breakpoint
DEALLOCATE PREPARE _stmt;
