CREATE TABLE `allowed_apps` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`path` text NOT NULL,
	`type` text NOT NULL,
	`description` text,
	`is_enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `arena_matches` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`user_message_id` text NOT NULL,
	`left_message_id` text,
	`right_message_id` text,
	`left_provider_id` text NOT NULL,
	`left_model_id` text NOT NULL,
	`right_provider_id` text NOT NULL,
	`right_model_id` text NOT NULL,
	`vote` text,
	`voted_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bardas` (
	`id` text PRIMARY KEY NOT NULL,
	`namespace` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`version` text,
	`author` text,
	`is_enabled` integer DEFAULT true,
	`roles_count` integer DEFAULT 0,
	`commands_count` integer DEFAULT 0,
	`prompts_count` integer DEFAULT 0,
	`fragments_count` integer DEFAULT 0,
	`libraries_count` integer DEFAULT 0,
	`mcp_servers_count` integer DEFAULT 0,
	`skills_count` integer DEFAULT 0,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `custom_models` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`label` text NOT NULL,
	`model_id` text NOT NULL,
	`type` text DEFAULT 'text' NOT NULL,
	`is_enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `episodes` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`category` text NOT NULL,
	`confidence` real DEFAULT 0.5 NOT NULL,
	`occurrences` integer DEFAULT 1 NOT NULL,
	`project_id` text,
	`source_conversation_id` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `libraries` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`color` text,
	`icon` text,
	`project_id` text,
	`namespace` text,
	`embedding_model` text DEFAULT 'local' NOT NULL,
	`embedding_dimensions` integer DEFAULT 384 NOT NULL,
	`sources_count` integer DEFAULT 0 NOT NULL,
	`chunks_count` integer DEFAULT 0 NOT NULL,
	`total_size_bytes` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'empty' NOT NULL,
	`last_indexed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `library_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`library_id` text NOT NULL,
	`source_id` text NOT NULL,
	`point_id` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`start_char` integer NOT NULL,
	`end_char` integer NOT NULL,
	`heading` text,
	`line_start` integer,
	`line_end` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`library_id`) REFERENCES `libraries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `library_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `library_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`library_id` text NOT NULL,
	`filename` text NOT NULL,
	`original_path` text NOT NULL,
	`stored_path` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`extracted_text` text,
	`extracted_length` integer,
	`chunks_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`error_message` text,
	`content_hash` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`library_id`) REFERENCES `libraries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `llm_costs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`conversation_id` text,
	`model_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`tokens_in` integer DEFAULT 0 NOT NULL,
	`tokens_out` integer DEFAULT 0 NOT NULL,
	`cost` real DEFAULT 0 NOT NULL,
	`metadata` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `meet_costs` (
	`id` text PRIMARY KEY NOT NULL,
	`meet_session_id` text NOT NULL,
	`message_id` text NOT NULL,
	`sender` text NOT NULL,
	`provider_id` text NOT NULL,
	`model_id` text NOT NULL,
	`tokens_in` integer DEFAULT 0 NOT NULL,
	`tokens_out` integer DEFAULT 0 NOT NULL,
	`cost` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`meet_session_id`) REFERENCES `meet_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `meet_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`host_name` text NOT NULL,
	`guest_name` text NOT NULL,
	`invite_code` text NOT NULL,
	`invite_expires_at` integer NOT NULL,
	`status` text DEFAULT 'waiting' NOT NULL,
	`guest_can_llm` integer DEFAULT false NOT NULL,
	`guest_auto_approve` integer DEFAULT false NOT NULL,
	`guest_visibility` text DEFAULT 'response-only' NOT NULL,
	`started_at` integer,
	`ended_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `oneiric_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`trigger` text NOT NULL,
	`model_id` text NOT NULL,
	`chunks_analyzed` integer DEFAULT 0 NOT NULL,
	`chunks_merged` integer DEFAULT 0 NOT NULL,
	`chunks_deleted` integer DEFAULT 0 NOT NULL,
	`episodes_analyzed` integer DEFAULT 0 NOT NULL,
	`episodes_reinforced` integer DEFAULT 0 NOT NULL,
	`episodes_staled` integer DEFAULT 0 NOT NULL,
	`episodes_deleted` integer DEFAULT 0 NOT NULL,
	`episodes_created` integer DEFAULT 0 NOT NULL,
	`episodes_updated` integer DEFAULT 0 NOT NULL,
	`tokens_in` integer DEFAULT 0 NOT NULL,
	`tokens_out` integer DEFAULT 0 NOT NULL,
	`cost` real DEFAULT 0 NOT NULL,
	`duration_ms` integer,
	`error_message` text,
	`actions` text NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE TABLE `permission_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`tool_name` text NOT NULL,
	`rule_content` text,
	`behavior` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `skills` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`allowed_tools` text,
	`shell` text DEFAULT 'bash',
	`effort` text,
	`argument_hint` text,
	`user_invocable` integer DEFAULT true,
	`enabled` integer DEFAULT true,
	`source` text NOT NULL,
	`git_url` text,
	`namespace` text,
	`maton_verdict` text,
	`maton_report` text,
	`installed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `skills_name_unique` ON `skills` (`name`);--> statement-breakpoint
CREATE TABLE `slash_commands` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`prompt` text NOT NULL,
	`category` text,
	`project_id` text,
	`is_builtin` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0,
	`namespace` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `vector_sync_state` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`status` text NOT NULL,
	`point_id` text,
	`error_message` text,
	`created_at` integer NOT NULL,
	`indexed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vector_sync_state_message_id_unique` ON `vector_sync_state` (`message_id`);--> statement-breakpoint
ALTER TABLE `conversations` ADD `workspace_path` text DEFAULT '~/.cruchot/sandbox/' NOT NULL;--> statement-breakpoint
ALTER TABLE `conversations` ADD `active_library_id` text;--> statement-breakpoint
ALTER TABLE `conversations` ADD `is_favorite` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `conversations` ADD `is_arena` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `conversations` ADD `is_scheduled_task` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `conversations` ADD `last_episode_message_id` text;--> statement-breakpoint
ALTER TABLE `conversations` ADD `last_oneiric_run_at` integer;--> statement-breakpoint
ALTER TABLE `conversations` ADD `compact_summary` text;--> statement-breakpoint
ALTER TABLE `conversations` ADD `compact_boundary_id` text;--> statement-breakpoint
ALTER TABLE `mcp_servers` ADD `namespace` text;--> statement-breakpoint
ALTER TABLE `memory_fragments` ADD `namespace` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `meet_sender` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `meet_target` text;--> statement-breakpoint
ALTER TABLE `prompts` ADD `namespace` text;--> statement-breakpoint
ALTER TABLE `remote_sessions` ADD `session_type` text DEFAULT 'telegram';--> statement-breakpoint
ALTER TABLE `remote_sessions` ADD `ws_client_fingerprint` text;--> statement-breakpoint
ALTER TABLE `remote_sessions` ADD `ws_session_token` text;--> statement-breakpoint
ALTER TABLE `remote_sessions` ADD `ws_ip_address` text;--> statement-breakpoint
ALTER TABLE `roles` ADD `namespace` text;