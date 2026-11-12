DROP INDEX `users_email_uq`;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_uq` ON `users` (`email`) WHERE "users"."deleted_at" is null;