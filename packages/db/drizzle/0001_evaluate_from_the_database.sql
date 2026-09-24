-- ADR-0030. SQLite will not add a NOT NULL column without a default, so both carry one.
-- `facts` is rewritten by the next `db:seed`/`db:reset`, which rebuilds every seeded row;
-- until then `loadResolvedProfile` refuses a version whose registry is empty.
ALTER TABLE `ruleset_versions` ADD `facts` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
-- A run stored before this column existed is backfilled with its scenario's current
-- situation: the best record there is, and exact unless the scenario was edited since.
ALTER TABLE `evaluations` ADD `situation` text DEFAULT 'null' NOT NULL;--> statement-breakpoint
UPDATE `evaluations` SET `situation` = (SELECT `situation` FROM `scenarios` WHERE `scenarios`.`id` = `evaluations`.`scenario_id`);
