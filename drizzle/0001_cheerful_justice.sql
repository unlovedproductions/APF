CREATE TABLE `api_credentials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`platform` varchar(32) NOT NULL,
	`apiKey` text NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `api_credentials_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bookmarks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`productId` int NOT NULL,
	`notes` text,
	`status` enum('interested','researching','promoting','archived') NOT NULL DEFAULT 'interested',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bookmarks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `data_refresh_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`platform` varchar(32) NOT NULL,
	`status` enum('pending','success','failed') NOT NULL,
	`productsCount` int DEFAULT 0,
	`errorMessage` text,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `data_refresh_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`platform` varchar(32) NOT NULL,
	`platformProductId` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`vendor` varchar(255),
	`category` varchar(255),
	`keywords` text,
	`description` text,
	`saleCount` int DEFAULT 0,
	`aggregateSales` decimal(12,2) DEFAULT '0',
	`refundCount` int DEFAULT 0,
	`commissionRate` decimal(5,2),
	`commissionType` varchar(32),
	`affiliateLink` text,
	`hiddenGemScore` decimal(5,2) DEFAULT '0',
	`scoreComponents` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`platformCreatedAt` timestamp,
	`lastUpdatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`dataFetchedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `products_id` PRIMARY KEY(`id`)
);
