CREATE TABLE IF NOT EXISTS `product_promote_outcomes` (
  `id` int AUTO_INCREMENT NOT NULL,
  `user_id` int NOT NULL,
  `product_id` int NOT NULL,
  `event` varchar(32) NOT NULL,
  `net_epc` decimal(12,4),
  `refund_rate` decimal(5,2),
  `hidden_gem_score` decimal(8,2),
  `notes` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_promote_outcomes_product` (`product_id`),
  KEY `idx_promote_outcomes_user` (`user_id`),
  KEY `idx_promote_outcomes_event` (`event`)
);
