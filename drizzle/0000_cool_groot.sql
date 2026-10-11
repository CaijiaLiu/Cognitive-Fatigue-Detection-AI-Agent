CREATE TABLE `upload_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `research_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`received_at` text NOT NULL,
	`mode` text NOT NULL,
	`payload` text NOT NULL,
	`ticket_hash` text NOT NULL,
	`withdrawal_hash` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `upload_tickets` (
	`hash` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`expires` integer NOT NULL
);
