CREATE TABLE IF NOT EXISTS `product_vendor_materials` (
  `id` int AUTO_INCREMENT NOT NULL,
  `product_id` int NOT NULL,
  `source_url` text NOT NULL,
  `source_url_hash` varchar(64) NOT NULL,
  `source_type` varchar(64) NOT NULL,
  `domain` varchar(255),
  `title` text,
  `content_text` text,
  `structured_blocks` json,
  `is_vendor_hosted` boolean NOT NULL DEFAULT true,
  `fetch_status` varchar(32) NOT NULL DEFAULT 'ok',
  `discovered_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `product_vendor_materials_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_vendor_material_product_url` UNIQUE(`product_id`,`source_url_hash`)
);

CREATE INDEX `idx_vendor_materials_product` ON `product_vendor_materials` (`product_id`);
CREATE INDEX `idx_vendor_materials_type` ON `product_vendor_materials` (`source_type`);
