CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`parent_id` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `dict_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dict` text NOT NULL,
	`code` text NOT NULL,
	`title` text NOT NULL,
	`extra` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dict_code_uq` ON `dict_items` (`dict`,`code`);--> statement-breakpoint
CREATE TABLE `media` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`path` text NOT NULL,
	`mime` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`width` integer,
	`height` integer,
	`owner_scope` text NOT NULL,
	`owner_id` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`uploaded_by` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `media_owner_idx` ON `media` (`owner_scope`,`owner_id`);--> statement-breakpoint
CREATE TABLE `options` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`price_delta_minor` integer DEFAULT 0 NOT NULL,
	`stock_item_id` integer,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`stock_item_id`) REFERENCES `stock_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `product_options` (
	`variant_id` integer NOT NULL,
	`option_id` integer NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`variant_id`, `option_id`),
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`option_id`) REFERENCES `options`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `product_variants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`sku` text NOT NULL,
	`size_code` text NOT NULL,
	`material_id` integer NOT NULL,
	`length_mm` integer,
	`width_mm` integer,
	`height_mm` integer,
	`weight_g` integer,
	`base_price_minor` integer DEFAULT 0 NOT NULL,
	`cost_price_minor` integer DEFAULT 0 NOT NULL,
	`stock_item_id` integer,
	`is_published` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`material_id`) REFERENCES `dict_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`stock_item_id`) REFERENCES `stock_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `variants_sku_uq` ON `product_variants` (`sku`);--> statement-breakpoint
CREATE INDEX `variants_product_idx` ON `product_variants` (`product_id`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sku` text NOT NULL,
	`title` text NOT NULL,
	`category_id` integer,
	`description` text,
	`is_published` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_sku_uq` ON `products` (`sku`);--> statement-breakpoint
CREATE TABLE `contracts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`counterparty_id` integer NOT NULL,
	`number` text NOT NULL,
	`signed_at` integer,
	`valid_until` integer,
	`file_id` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`counterparty_id`) REFERENCES `counterparties`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `counterparties` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`legal_name` text,
	`inn` text,
	`kpp` text,
	`address` text,
	`phone` text,
	`email` text,
	`price_list_id` integer,
	`discount_percent` integer DEFAULT 0 NOT NULL,
	`settlement_scheme` text DEFAULT 'on_fact' NOT NULL,
	`manager_id` integer,
	`staff_limit` integer DEFAULT 10 NOT NULL,
	`notes` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`price_list_id`) REFERENCES `price_lists`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`manager_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cp_name_idx` ON `counterparties` (`name`);--> statement-breakpoint
CREATE TABLE `delivery_addresses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`counterparty_id` integer NOT NULL,
	`title` text NOT NULL,
	`address` text NOT NULL,
	`contact_name` text,
	`contact_phone` text,
	`lat` real,
	`lon` real,
	`is_default` integer DEFAULT false NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`counterparty_id`) REFERENCES `counterparties`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `payroll_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`period_id` integer NOT NULL,
	`staff_id` integer NOT NULL,
	`days_worked` integer DEFAULT 0 NOT NULL,
	`accrued_minor` integer DEFAULT 0 NOT NULL,
	`adjustment_minor` integer DEFAULT 0 NOT NULL,
	`adjustment_comment` text,
	`payout_minor` integer DEFAULT 0 NOT NULL,
	`paid_at` integer,
	`paid_comment` text,
	FOREIGN KEY (`period_id`) REFERENCES `payroll_periods`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payroll_lines_uq` ON `payroll_lines` (`period_id`,`staff_id`);--> statement-breakpoint
CREATE TABLE `payroll_periods` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`starts_on` integer NOT NULL,
	`ends_on` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`closed_by_id` integer,
	`closed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`closed_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payroll_periods_uq` ON `payroll_periods` (`starts_on`);--> statement-breakpoint
CREATE TABLE `staff` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`full_name` text NOT NULL,
	`position` text,
	`user_id` integer,
	`hired_at` integer,
	`fired_at` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `work_days` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`staff_id` integer NOT NULL,
	`work_date` integer NOT NULL,
	`present` integer DEFAULT true NOT NULL,
	`total_minor` integer DEFAULT 0 NOT NULL,
	`created_by_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_days_uq` ON `work_days` (`staff_id`,`work_date`);--> statement-breakpoint
CREATE TABLE `work_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`work_day_id` integer NOT NULL,
	`work_type_id` integer NOT NULL,
	`qty` integer NOT NULL,
	`rate_minor` integer DEFAULT 0 NOT NULL,
	`amount_minor` integer DEFAULT 0 NOT NULL,
	`request_id` integer,
	FOREIGN KEY (`work_day_id`) REFERENCES `work_days`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`work_type_id`) REFERENCES `dict_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`request_id`) REFERENCES `requests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `work_rate_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`version` integer NOT NULL,
	`valid_from` integer NOT NULL,
	`imported_by_id` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`imported_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `work_rates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`version_id` integer NOT NULL,
	`work_type_id` integer NOT NULL,
	`unit_id` integer NOT NULL,
	`rate_minor` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`version_id`) REFERENCES `work_rate_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`work_type_id`) REFERENCES `dict_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`unit_id`) REFERENCES `dict_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_rates_uq` ON `work_rates` (`version_id`,`work_type_id`);--> statement-breakpoint
CREATE TABLE `discount_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`counterparty_id` integer,
	`category_id` integer,
	`percent` integer NOT NULL,
	`valid_from` integer,
	`valid_to` integer,
	FOREIGN KEY (`counterparty_id`) REFERENCES `counterparties`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `price_list_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`price_list_id` integer NOT NULL,
	`variant_id` integer NOT NULL,
	`price_minor` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`price_list_id`) REFERENCES `price_lists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pli_uq` ON `price_list_items` (`price_list_id`,`variant_id`);--> statement-breakpoint
CREATE TABLE `price_lists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`is_base` integer DEFAULT false NOT NULL,
	`valid_from` integer,
	`valid_to` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_id` integer NOT NULL,
	`author_id` integer NOT NULL,
	`body` text NOT NULL,
	`is_internal` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `comments_request_idx` ON `comments` (`request_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `payment_marks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_id` integer NOT NULL,
	`amount_minor` integer DEFAULT 0 NOT NULL,
	`paid_at` integer NOT NULL,
	`method` text NOT NULL,
	`comment` text,
	`created_by_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `pm_request_idx` ON `payment_marks` (`request_id`);--> statement-breakpoint
CREATE TABLE `request_assignees` (
	`request_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`role` text NOT NULL,
	`taken_at` integer,
	`done_at` integer,
	PRIMARY KEY(`request_id`, `user_id`, `role`),
	FOREIGN KEY (`request_id`) REFERENCES `requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `request_item_options` (
	`item_id` integer NOT NULL,
	`option_id` integer NOT NULL,
	`price_delta_minor` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`item_id`, `option_id`),
	FOREIGN KEY (`item_id`) REFERENCES `request_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`option_id`) REFERENCES `options`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `request_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_id` integer NOT NULL,
	`variant_id` integer NOT NULL,
	`qty` integer NOT NULL,
	`unit_price_minor` integer DEFAULT 0 NOT NULL,
	`line_total_minor` integer DEFAULT 0 NOT NULL,
	`engraving` text,
	`comment` text,
	FOREIGN KEY (`request_id`) REFERENCES `requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `request_items_request_idx` ON `request_items` (`request_id`);--> statement-breakpoint
CREATE TABLE `request_status_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_id` integer NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`actor_id` integer,
	`reason_id` integer,
	`comment` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reason_id`) REFERENCES `dict_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `rsh_request_idx` ON `request_status_history` (`request_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`number` text NOT NULL,
	`counterparty_id` integer,
	`is_stock_request` integer DEFAULT false NOT NULL,
	`created_by_id` integer NOT NULL,
	`manager_id` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`delivery_address_id` integer,
	`is_pickup` integer DEFAULT false NOT NULL,
	`external_number` text,
	`comment` text,
	`items_total_minor` integer DEFAULT 0 NOT NULL,
	`discount_minor` integer DEFAULT 0 NOT NULL,
	`total_minor` integer DEFAULT 0 NOT NULL,
	`paid_minor` integer DEFAULT 0 NOT NULL,
	`charity_rate_bp` integer,
	`charity_amount_minor` integer,
	`submitted_at` integer,
	`accepted_at` integer,
	`ready_at` integer,
	`delivered_at` integer,
	`paid_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`counterparty_id`) REFERENCES `counterparties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`manager_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`delivery_address_id`) REFERENCES `delivery_addresses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `requests_number_uq` ON `requests` (`number`);--> statement-breakpoint
CREATE INDEX `requests_cp_status_idx` ON `requests` (`counterparty_id`,`status`);--> statement-breakpoint
CREATE INDEX `requests_status_idx` ON `requests` (`status`,`priority`);--> statement-breakpoint
CREATE INDEX `requests_created_idx` ON `requests` (`created_at`);--> statement-breakpoint
CREATE TABLE `bom_norms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bom_version_id` integer NOT NULL,
	`variant_id` integer NOT NULL,
	`component_id` integer NOT NULL,
	`qty_per_unit_milli` integer NOT NULL,
	FOREIGN KEY (`bom_version_id`) REFERENCES `bom_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`component_id`) REFERENCES `stock_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bom_norms_uq` ON `bom_norms` (`bom_version_id`,`variant_id`,`component_id`);--> statement-breakpoint
CREATE TABLE `bom_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`version` integer NOT NULL,
	`imported_by_id` integer,
	`source_file_id` integer,
	`is_active` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`imported_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_file_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `inventories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`comment` text,
	`created_by_id` integer NOT NULL,
	`applied_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `inventory_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`inventory_id` integer NOT NULL,
	`stock_item_id` integer NOT NULL,
	`expected_qty` integer NOT NULL,
	`actual_qty` integer NOT NULL,
	FOREIGN KEY (`inventory_id`) REFERENCES `inventories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`stock_item_id`) REFERENCES `stock_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `stock_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`code` text NOT NULL,
	`title` text NOT NULL,
	`unit_id` integer NOT NULL,
	`min_threshold` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`unit_id`) REFERENCES `dict_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stock_items_code_uq` ON `stock_items` (`code`);--> statement-breakpoint
CREATE TABLE `stock_moves` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`stock_item_id` integer NOT NULL,
	`qty` integer NOT NULL,
	`type` text NOT NULL,
	`request_id` integer,
	`reversal_of_id` integer,
	`reason_id` integer,
	`comment` text,
	`actor_id` integer,
	`occurred_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`stock_item_id`) REFERENCES `stock_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`request_id`) REFERENCES `requests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reversal_of_id`) REFERENCES `stock_moves`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reason_id`) REFERENCES `dict_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `stock_moves_item_idx` ON `stock_moves` (`stock_item_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `stock_moves_request_idx` ON `stock_moves` (`request_id`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_id` integer,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` integer,
	`before` text,
	`after` text,
	`ip` text,
	`request_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `audit_log` (`entity`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `charity_totals` (
	`scope` text PRIMARY KEY NOT NULL,
	`amount_minor` integer DEFAULT 0 NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `charity_transfers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`amount_minor` integer DEFAULT 0 NOT NULL,
	`transferred_at` integer NOT NULL,
	`document_ref` text,
	`comment` text,
	`created_by_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `document_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`number` text,
	`request_id` integer,
	`period_id` integer,
	`variant` text DEFAULT 'full' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`file_id` integer,
	`error` text,
	`created_by_id` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`period_id`) REFERENCES `payroll_periods`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`file_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `documents_request_idx` ON `documents` (`request_id`);--> statement-breakpoint
CREATE TABLE `job_queue` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`topic` text NOT NULL,
	`payload` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 5 NOT NULL,
	`visible_at` integer NOT NULL,
	`locked_at` integer,
	`locked_by` text,
	`last_error` text,
	`created_at` integer NOT NULL,
	`finished_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_idem_uq` ON `job_queue` (`topic`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `job_poll_idx` ON `job_queue` (`status`,`visible_at`);--> statement-breakpoint
CREATE TABLE `notification_rules` (
	`event_key` text NOT NULL,
	`role_code` text NOT NULL,
	`channel` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	PRIMARY KEY(`event_key`, `role_code`, `channel`)
);
--> statement-breakpoint
CREATE TABLE `notification_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_key` text NOT NULL,
	`channel` text NOT NULL,
	`subject` text,
	`body` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `nt_uq` ON `notification_templates` (`event_key`,`channel`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_key` text NOT NULL,
	`user_id` integer NOT NULL,
	`channel` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`error` text,
	`sent_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `numbering_sequences` (
	`key` text PRIMARY KEY NOT NULL,
	`prefix` text DEFAULT '' NOT NULL,
	`period` text DEFAULT 'year' NOT NULL,
	`period_key` text DEFAULT '' NOT NULL,
	`last_value` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_endpoint_uq` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_by_id` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `user_notification_prefs` (
	`user_id` integer NOT NULL,
	`event_key` text NOT NULL,
	`channel` text NOT NULL,
	`enabled` integer NOT NULL,
	PRIMARY KEY(`user_id`, `event_key`, `channel`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `password_reset_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prt_token_uq` ON `password_reset_tokens` (`token_hash`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`hits` integer DEFAULT 0 NOT NULL,
	`window_start` integer NOT NULL,
	`blocked_until` integer
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`title` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roles_code_uq` ON `roles` (`code`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`ip` text,
	`user_agent` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `user_roles` (
	`user_id` integer NOT NULL,
	`role_id` integer NOT NULL,
	PRIMARY KEY(`user_id`, `role_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
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
CREATE UNIQUE INDEX `users_email_uq` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_counterparty_idx` ON `users` (`counterparty_id`);