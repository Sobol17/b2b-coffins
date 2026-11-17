PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_price_list_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`price_list_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`price_minor` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`price_list_id`) REFERENCES `price_lists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- Each list keeps the minimum explicit model override; partial overrides now cover every size.
-- The model base keeps the minimum variant base; historical request totals stay frozen.
INSERT INTO `__new_price_list_items`("id", "price_list_id", "product_id", "price_minor")
SELECT min(pi.id), pi.price_list_id, v.product_id, min(pi.price_minor)
FROM price_list_items pi JOIN product_variants v ON v.id = pi.variant_id
GROUP BY pi.price_list_id, v.product_id;--> statement-breakpoint
DROP TABLE `price_list_items`;--> statement-breakpoint
ALTER TABLE `__new_price_list_items` RENAME TO `price_list_items`;--> statement-breakpoint
CREATE UNIQUE INDEX `pli_uq` ON `price_list_items` (`price_list_id`,`product_id`);--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text,
	`login` text,
	`password_hash` text NOT NULL,
	`full_name` text NOT NULL,
	`phone` text,
	`scope` text NOT NULL,
	`counterparty_id` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`must_change_password` integer DEFAULT true NOT NULL,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`last_login_at` integer,
	`timezone` text DEFAULT 'Europe/Moscow' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`counterparty_id`) REFERENCES `counterparties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "email", "login", "password_hash", "full_name", "phone", "scope", "counterparty_id", "is_active", "must_change_password", "failed_attempts", "locked_until", "last_login_at", "timezone", "created_at", "updated_at", "deleted_at") SELECT "id", "email", "login", "password_hash", "full_name", "phone", "scope", "counterparty_id", "is_active", "must_change_password", "failed_attempts", "locked_until", "last_login_at", "timezone", "created_at", "updated_at", "deleted_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_uq` ON `users` (`email`) WHERE "users"."deleted_at" is null;--> statement-breakpoint
UPDATE users SET email = nullif(lower(trim(email)), '');
--> statement-breakpoint
-- Match normalizeAccountPhone: keep ASCII digits, including across Unicode whitespace.
WITH RECURSIVE phone_digits(user_id, remaining, digits) AS (
 SELECT id, coalesce(phone, ''), '' FROM users
 UNION ALL
 SELECT user_id, substr(remaining, 2), digits || CASE
  WHEN substr(remaining, 1, 1) GLOB '[0-9]' THEN substr(remaining, 1, 1)
  ELSE '' END
 FROM phone_digits WHERE remaining <> ''
)
UPDATE users SET phone = (
 SELECT CASE
  WHEN digits = '' THEN NULL
  WHEN length(digits) = 11 AND substr(digits, 1, 1) = '8' THEN '+7' || substr(digits, 2)
  WHEN length(digits) = 10 THEN '+7' || digits
  ELSE '+' || digits END
 FROM phone_digits WHERE user_id = users.id AND remaining = ''
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_phone_uq` ON `users` (`phone`) WHERE "users"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX `users_counterparty_idx` ON `users` (`counterparty_id`);--> statement-breakpoint
ALTER TABLE `products` ADD `base_price_minor` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE products SET base_price_minor = coalesce(
 (SELECT min(v.base_price_minor) FROM product_variants v WHERE v.product_id = products.id AND v.deleted_at IS NULL),
 (SELECT min(v.base_price_minor) FROM product_variants v WHERE v.product_id = products.id), 0);
--> statement-breakpoint
ALTER TABLE `stock_items` ADD `deleted_at` integer;
--> statement-breakpoint
UPDATE options SET price_delta_minor = 0;
