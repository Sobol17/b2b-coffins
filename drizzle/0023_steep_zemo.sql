CREATE TABLE `shop_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_item_id` integer NOT NULL,
	`task_id` integer NOT NULL,
	`qty` integer NOT NULL,
	`done_qty` integer DEFAULT 0 NOT NULL,
	`finished_at` integer,
	`production_move_id` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`request_item_id`) REFERENCES `request_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `shop_tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`production_move_id`) REFERENCES `stock_moves`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `shop_jobs_item_idx` ON `shop_jobs` (`request_item_id`,`finished_at`);--> statement-breakpoint
CREATE INDEX `shop_jobs_task_idx` ON `shop_jobs` (`task_id`);--> statement-breakpoint
CREATE TABLE `shop_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_id` integer NOT NULL,
	`station` text NOT NULL,
	`taken_at` integer,
	`taken_by_id` integer,
	`completed_at` integer,
	`completed_by_id` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`taken_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`completed_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `shop_tasks_station_idx` ON `shop_tasks` (`station`,`completed_at`);--> statement-breakpoint
CREATE INDEX `shop_tasks_request_idx` ON `shop_tasks` (`request_id`);