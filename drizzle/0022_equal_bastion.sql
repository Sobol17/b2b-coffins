ALTER TABLE `counterparties` ADD `region_price_list_id` integer REFERENCES price_lists(id);--> statement-breakpoint
ALTER TABLE `price_lists` ADD `is_personal` integer DEFAULT false NOT NULL;