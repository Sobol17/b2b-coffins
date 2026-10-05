CREATE TABLE `work_day_staff` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`work_day_id` integer NOT NULL,
	`staff_id` integer NOT NULL,
	FOREIGN KEY (`work_day_id`) REFERENCES `work_days`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_day_staff_uq` ON `work_day_staff` (`work_day_id`,`staff_id`);--> statement-breakpoint
CREATE TABLE `work_days` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`work_date` integer NOT NULL,
	`total_minor` integer DEFAULT 0 NOT NULL,
	`share_minor` integer DEFAULT 0 NOT NULL,
	`created_by_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_days_uq` ON `work_days` (`work_date`);--> statement-breakpoint
CREATE TABLE `work_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`work_day_id` integer NOT NULL,
	`work_type_id` integer NOT NULL,
	`qty` integer NOT NULL,
	`rate_minor` integer DEFAULT 0 NOT NULL,
	`amount_minor` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`work_day_id`) REFERENCES `work_days`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`work_type_id`) REFERENCES `work_types`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_entries_uq` ON `work_entries` (`work_day_id`,`work_type_id`);--> statement-breakpoint
CREATE TABLE `work_types` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`rate_minor` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_types_title_uq` ON `work_types` (`title`);