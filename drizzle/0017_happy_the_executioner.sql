CREATE TABLE `work_entry_staff` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`work_entry_id` integer NOT NULL,
	`staff_id` integer NOT NULL,
	FOREIGN KEY (`work_entry_id`) REFERENCES `work_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_entry_staff_uq` ON `work_entry_staff` (`work_entry_id`,`staff_id`);--> statement-breakpoint
DROP INDEX `work_entries_uq`;--> statement-breakpoint
ALTER TABLE `work_days` DROP COLUMN `share_minor`;