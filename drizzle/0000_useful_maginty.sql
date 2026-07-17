CREATE TABLE `highlights` (
	`bookmark_id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`chapter_uid` text,
	`chapter_title` text,
	`mark_text` text NOT NULL,
	`range_value` text,
	`color_style` integer,
	`create_time` integer,
	`last_seen_at` integer NOT NULL,
	`removed_at` integer
);
--> statement-breakpoint
CREATE INDEX `highlights_book_idx` ON `highlights` (`book_id`,`create_time`);--> statement-breakpoint
CREATE INDEX `highlights_active_idx` ON `highlights` (`removed_at`,`create_time`);--> statement-breakpoint
CREATE TABLE `notebook_summaries` (
	`book_id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`author` text DEFAULT '' NOT NULL,
	`cover` text,
	`review_count` integer DEFAULT 0 NOT NULL,
	`highlight_count` integer DEFAULT 0 NOT NULL,
	`bookmark_count` integer DEFAULT 0 NOT NULL,
	`reading_progress` integer DEFAULT 0 NOT NULL,
	`marked_status` integer DEFAULT 0 NOT NULL,
	`sort_value` integer,
	`last_seen_at` integer NOT NULL,
	`removed_at` integer
);
--> statement-breakpoint
CREATE TABLE `personal_reviews` (
	`review_id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`chapter_uid` text,
	`range_value` text,
	`content` text NOT NULL,
	`chapter_name` text,
	`star` integer,
	`is_finish` integer,
	`create_time` integer,
	`last_seen_at` integer NOT NULL,
	`removed_at` integer
);
--> statement-breakpoint
CREATE INDEX `personal_reviews_book_idx` ON `personal_reviews` (`book_id`,`create_time`);--> statement-breakpoint
CREATE INDEX `personal_reviews_active_idx` ON `personal_reviews` (`removed_at`,`create_time`);--> statement-breakpoint
CREATE TABLE `reading_progress_current` (
	`book_id` text PRIMARY KEY NOT NULL,
	`chapter_uid` text,
	`chapter_offset` integer,
	`progress` integer DEFAULT 0 NOT NULL,
	`record_reading_time` integer DEFAULT 0 NOT NULL,
	`is_start_reading` integer DEFAULT 0 NOT NULL,
	`source_update_time` integer,
	`finish_time` integer,
	`synced_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reading_progress_history` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`chapter_uid` text,
	`chapter_offset` integer,
	`progress` integer DEFAULT 0 NOT NULL,
	`record_reading_time` integer DEFAULT 0 NOT NULL,
	`is_start_reading` integer DEFAULT 0 NOT NULL,
	`source_update_time` integer,
	`finish_time` integer,
	`observed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reading_progress_history_change_idx` ON `reading_progress_history` (`book_id`,`progress`,`record_reading_time`,`source_update_time`);--> statement-breakpoint
CREATE INDEX `reading_progress_history_book_idx` ON `reading_progress_history` (`book_id`,`observed_at`);--> statement-breakpoint
CREATE TABLE `reading_stat_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`base_time` integer DEFAULT 0 NOT NULL,
	`total_read_time` integer DEFAULT 0 NOT NULL,
	`read_days` integer DEFAULT 0 NOT NULL,
	`day_average_read_time` integer DEFAULT 0 NOT NULL,
	`compare_value` integer,
	`read_longest_json` text DEFAULT '[]' NOT NULL,
	`read_stat_json` text DEFAULT '[]' NOT NULL,
	`prefer_category_json` text DEFAULT '[]' NOT NULL,
	`prefer_time_json` text DEFAULT '[]' NOT NULL,
	`prefer_author_json` text DEFAULT '[]' NOT NULL,
	`captured_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reading_stat_mode_idx` ON `reading_stat_snapshots` (`mode`,`captured_at`);--> statement-breakpoint
CREATE TABLE `reading_time_buckets` (
	`id` text PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`period_base_time` integer DEFAULT 0 NOT NULL,
	`bucket_start` integer NOT NULL,
	`seconds` integer DEFAULT 0 NOT NULL,
	`captured_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reading_time_bucket_source_idx` ON `reading_time_buckets` (`mode`,`period_base_time`,`bucket_start`);--> statement-breakpoint
CREATE INDEX `reading_time_bucket_start_idx` ON `reading_time_buckets` (`bucket_start`);--> statement-breakpoint
CREATE TABLE `shelf_items` (
	`id` text PRIMARY KEY NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`title` text NOT NULL,
	`author` text DEFAULT '' NOT NULL,
	`cover` text,
	`category` text,
	`finish_reading` integer DEFAULT 0 NOT NULL,
	`is_top` integer DEFAULT 0 NOT NULL,
	`is_secret` integer DEFAULT 0 NOT NULL,
	`read_update_time` integer,
	`source_update_time` integer,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`removed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shelf_items_source_idx` ON `shelf_items` (`source_type`,`source_id`);--> statement-breakpoint
CREATE INDEX `shelf_items_active_idx` ON `shelf_items` (`removed_at`,`read_update_time`);--> statement-breakpoint
CREATE TABLE `sync_lock` (
	`lock_key` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`status` text NOT NULL,
	`stage` text NOT NULL,
	`cursor_json` text DEFAULT '{}' NOT NULL,
	`started_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`finished_at` integer,
	`shelf_count` integer DEFAULT 0 NOT NULL,
	`progress_updated` integer DEFAULT 0 NOT NULL,
	`notes_updated` integer DEFAULT 0 NOT NULL,
	`stats_updated` integer DEFAULT 0 NOT NULL,
	`error_code` text,
	`error_message` text
);
--> statement-breakpoint
CREATE INDEX `sync_runs_status_idx` ON `sync_runs` (`status`,`started_at`);