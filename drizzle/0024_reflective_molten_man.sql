CREATE TABLE `shop_unit_works` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`unit_id` integer NOT NULL,
	`task_id` integer,
	`station` text NOT NULL,
	`staff_id` integer NOT NULL,
	`taken_at` integer NOT NULL,
	`completed_at` integer,
	`work_date` integer,
	`work_type_id` integer,
	`rate_minor` integer DEFAULT 0 NOT NULL,
	`confirmed_at` integer,
	`confirmed_by_id` integer,
	FOREIGN KEY (`unit_id`) REFERENCES `shop_units`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `shop_tasks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`work_type_id`) REFERENCES `work_types`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`confirmed_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shop_unit_works_unit_station_uq` ON `shop_unit_works` (`unit_id`,`station`);--> statement-breakpoint
CREATE TABLE `shop_units` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_item_id` integer,
	`job_id` integer,
	`product_title` text NOT NULL,
	`request_number` text NOT NULL,
	`legacy_done` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`request_item_id`) REFERENCES `request_items`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`job_id`) REFERENCES `shop_jobs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `shop_units_job_idx` ON `shop_units` (`job_id`);--> statement-breakpoint
ALTER TABLE `work_day_staff` ADD `is_carpenter` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `work_entries` ADD `shop_unit_work_id` integer REFERENCES shop_unit_works(id);--> statement-breakpoint
CREATE UNIQUE INDEX `work_entries_shop_unit_work_uq` ON `work_entries` (`shop_unit_work_id`);--> statement-breakpoint
ALTER TABLE `work_types` ADD `variant_id` integer REFERENCES product_variants(id);--> statement-breakpoint
CREATE UNIQUE INDEX `work_types_variant_role_uq` ON `work_types` (`variant_id`,`role_code`);
--> statement-breakpoint
WITH RECURSIVE pieces(job_id, ordinal) AS (
	SELECT id, 1 FROM shop_jobs WHERE qty > 0
	UNION ALL
	SELECT pieces.job_id, pieces.ordinal + 1 FROM pieces
	INNER JOIN shop_jobs j ON j.id = pieces.job_id WHERE pieces.ordinal < j.qty
)
INSERT INTO shop_units (request_item_id, job_id, product_title, request_number, legacy_done)
SELECT j.request_item_id, j.id, p.title, r.number,
	CASE WHEN pieces.ordinal <= j.done_qty THEN 1 ELSE 0 END
FROM pieces INNER JOIN shop_jobs j ON j.id = pieces.job_id
INNER JOIN request_items ri ON ri.id = j.request_item_id
INNER JOIN requests r ON r.id = ri.request_id
INNER JOIN product_variants v ON v.id = ri.variant_id
INNER JOIN products p ON p.id = v.product_id;
