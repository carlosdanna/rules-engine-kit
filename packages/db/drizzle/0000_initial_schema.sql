CREATE TABLE `fixtures` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`kind` text NOT NULL,
	`ruleset_scope` text NOT NULL,
	`data` text NOT NULL,
	`citation` text NOT NULL,
	`interpretation` text,
	`source_id` text NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `fixtures_slug_idx` ON `fixtures` (`slug`);--> statement-breakpoint
CREATE TABLE `templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`tags` text NOT NULL,
	`params_schema` text NOT NULL,
	`skeleton` text NOT NULL,
	`suggested_profiles` text NOT NULL,
	`schema_version` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `profile_layers` (
	`profile_id` text NOT NULL,
	`ruleset_version_id` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`profile_id`, `position`),
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ruleset_version_id`) REFERENCES `ruleset_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `profile_layers_version_idx` ON `profile_layers` (`ruleset_version_id`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`resolved_hash` text NOT NULL,
	`origin` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rules` (
	`id` text PRIMARY KEY NOT NULL,
	`ruleset_version_id` text NOT NULL,
	`rule_key` text NOT NULL,
	`op` text NOT NULL,
	`phase` text,
	`priority` integer,
	`label` text,
	`description` text,
	`tags` text,
	`condition` text,
	`effects` text,
	`citation` text,
	`interpretation` text,
	`patch` text,
	`reason` text,
	FOREIGN KEY (`ruleset_version_id`) REFERENCES `ruleset_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `rules_version_idx` ON `rules` (`ruleset_version_id`);--> statement-breakpoint
CREATE INDEX `rules_key_idx` ON `rules` (`rule_key`);--> statement-breakpoint
CREATE TABLE `ruleset_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`ruleset_id` text NOT NULL,
	`semver` text NOT NULL,
	`base_ruleset_id` text,
	`base_range` text,
	`content_hash` text NOT NULL,
	`source_id` text NOT NULL,
	FOREIGN KEY (`ruleset_id`) REFERENCES `rulesets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ruleset_versions_ruleset_idx` ON `ruleset_versions` (`ruleset_id`);--> statement-breakpoint
CREATE TABLE `rulesets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `evaluations` (
	`id` text PRIMARY KEY NOT NULL,
	`scenario_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`profile_hash` text NOT NULL,
	`seed` text NOT NULL,
	`engine_version` text NOT NULL,
	`trace_schema_version` integer NOT NULL,
	`outcome` text NOT NULL,
	`trace` text NOT NULL,
	FOREIGN KEY (`scenario_id`) REFERENCES `scenarios`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `evaluations_scenario_idx` ON `evaluations` (`scenario_id`);--> statement-breakpoint
CREATE INDEX `evaluations_profile_idx` ON `evaluations` (`profile_id`);--> statement-breakpoint
CREATE TABLE `scenarios` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`situation` text NOT NULL,
	`template_id` text,
	`params` text,
	`origin` text NOT NULL,
	`schema_version` integer NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `scenarios_template_idx` ON `scenarios` (`template_id`);--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`author` text NOT NULL,
	`url` text NOT NULL,
	`license` text NOT NULL,
	`attribution_text` text NOT NULL
);
