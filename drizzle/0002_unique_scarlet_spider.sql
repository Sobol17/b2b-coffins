CREATE TABLE `counterparty_product_prices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`counterparty_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`price_minor` integer DEFAULT 0 NOT NULL,
	`updated_by_id` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`counterparty_id`) REFERENCES `counterparties`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cpp_uq` ON `counterparty_product_prices` (`counterparty_id`,`product_id`);