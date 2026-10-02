ALTER TABLE `inventories` ADD `kind` text DEFAULT 'component' NOT NULL;--> statement-breakpoint
ALTER TABLE `inventory_lines` ADD `option_id` integer REFERENCES options(id);