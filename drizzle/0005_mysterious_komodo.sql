CREATE TABLE `notification_feed` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`event_key` text NOT NULL,
	`entity_id` integer NOT NULL,
	`read_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `feed_user_idx` ON `notification_feed` (`user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `feed_uq` ON `notification_feed` (`user_id`,`event_key`,`entity_id`);