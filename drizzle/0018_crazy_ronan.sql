CREATE TABLE `support_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`thread_id` integer NOT NULL,
	`author_id` integer NOT NULL,
	`side` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `support_threads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `support_messages_thread_idx` ON `support_messages` (`thread_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `support_threads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`counterparty_id` integer NOT NULL,
	`created_by_id` integer NOT NULL,
	`request_id` integer,
	`subject` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`last_message_at` integer NOT NULL,
	`last_message_side` text NOT NULL,
	`closed_at` integer,
	`closed_by_id` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`counterparty_id`) REFERENCES `counterparties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`request_id`) REFERENCES `requests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`closed_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `support_threads_cp_idx` ON `support_threads` (`counterparty_id`,`last_message_at`);--> statement-breakpoint
CREATE INDEX `support_threads_author_idx` ON `support_threads` (`created_by_id`,`last_message_at`);--> statement-breakpoint
CREATE INDEX `support_threads_status_idx` ON `support_threads` (`status`,`last_message_at`);