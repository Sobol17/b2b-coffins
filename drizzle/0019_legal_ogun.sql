CREATE TABLE `finance_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`occurred_at` integer NOT NULL,
	`comment` text NOT NULL,
	`created_by_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `finance_entries_occurred_idx` ON `finance_entries` (`occurred_at`);