/**
 * Saved situations, and the runs made from them.
 *
 * `scenarios` is shared (ADR-0004): the six in `scenarios/` are seeded, and every scenario the
 * app creates — blank, from a template, or by duplicating (FR-18) — is a user row. The whole
 * timeline lives in `situation`, closed over its content (ADR-0017), so a run replays
 * identically after a fixture is corrected; `template_id` and `params` are what a *deliberate*
 * correction is taken up through, by re-rendering.
 *
 * `evaluations` is user-only and therefore carries no `origin`: nothing in `content/` is a run.
 * Its four VR-7 columns are the point of the table — a stored outcome that cannot say which
 * profile, seed and engine produced it is not evidence of anything.
 */

import type { Outcome, Situation, Trace } from '@rules-engine-kit/engine';
import { relations } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { templates } from './content';
import { profiles } from './profiles';

export const scenarios = sqliteTable(
  'scenarios',
  {
    /** The scenario slug (ADR-0027). */
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    situation: text('situation', { mode: 'json' }).$type<Situation>().notNull(),
    /** `null` on a scenario written by hand rather than rendered (ADR-0028). */
    templateId: text('template_id').references(() => templates.id),
    params: text('params', { mode: 'json' }).$type<Record<string, unknown>>(),
    origin: text('origin', { enum: ['seed', 'user'] }).notNull(),
    /** `SITUATION_SCHEMA_VERSION` the situation was saved at; user rows migrate (VR-8). */
    schemaVersion: integer('schema_version').notNull(),
  },
  (table) => [index('scenarios_template_idx').on(table.templateId)],
);

export const evaluations = sqliteTable(
  'evaluations',
  {
    id: text('id').primaryKey(),
    scenarioId: text('scenario_id')
      .notNull()
      .references(() => scenarios.id),
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id),
    /** VR-7, all four. `profile_hash` is the resolved hash *at the time of the run*, which is
     * why it is stored here and not only on `profiles`: a profile can be re-ordered later. */
    profileHash: text('profile_hash').notNull(),
    seed: text('seed').notNull(),
    engineVersion: text('engine_version').notNull(),
    traceSchemaVersion: integer('trace_schema_version').notNull(),
    outcome: text('outcome', { mode: 'json' }).$type<Outcome>().notNull(),
    /** The flat, ordered event array (ADR-0014). */
    trace: text('trace', { mode: 'json' }).$type<Trace>().notNull(),
  },
  (table) => [
    index('evaluations_scenario_idx').on(table.scenarioId),
    index('evaluations_profile_idx').on(table.profileId),
  ],
);

export const scenariosRelations = relations(scenarios, ({ one, many }) => ({
  template: one(templates, { fields: [scenarios.templateId], references: [templates.id] }),
  evaluations: many(evaluations),
}));

export const evaluationsRelations = relations(evaluations, ({ one }) => ({
  scenario: one(scenarios, { fields: [evaluations.scenarioId], references: [scenarios.id] }),
  profile: one(profiles, { fields: [evaluations.profileId], references: [profiles.id] }),
}));

export type ScenarioRow = typeof scenarios.$inferSelect;
export type EvaluationRow = typeof evaluations.$inferSelect;
export type NewEvaluationRow = typeof evaluations.$inferInsert;
