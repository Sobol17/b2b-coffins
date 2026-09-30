ALTER TABLE `stock_moves` ADD `request_item_id` integer REFERENCES request_items(id);--> statement-breakpoint
CREATE INDEX `stock_moves_request_item_idx` ON `stock_moves` (`request_item_id`);