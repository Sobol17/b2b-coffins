CREATE TABLE `payroll_accruals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`staff_id` integer NOT NULL,
	`source` text NOT NULL,
	`source_id` integer NOT NULL,
	`work_date` integer NOT NULL,
	`qty` integer NOT NULL,
	`rate_minor` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payroll_accrual_source_uq` ON `payroll_accruals` (`source`,`source_id`,`staff_id`);--> statement-breakpoint
CREATE TABLE `staff_salary_terms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`staff_id` integer NOT NULL,
	`effective_on` text NOT NULL,
	`amount_minor` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `staff_salary_term_uq` ON `staff_salary_terms` (`staff_id`,`effective_on`);--> statement-breakpoint
ALTER TABLE `staff` ADD `pay_role` text DEFAULT 'piecework' NOT NULL;--> statement-breakpoint
ALTER TABLE `staff` ADD `monthly_salary_minor` integer DEFAULT 6000000 NOT NULL;--> statement-breakpoint
ALTER TABLE `staff` ADD `system_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `staff_system_key_unique` ON `staff` (`system_key`);