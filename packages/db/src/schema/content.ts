/**
 * The seeded content a template draws on and the templates themselves (FR-18, FR-19).
 *
 * Both are rebuilt from `content/` on every `db:seed`, so neither is ever edited in place.
 */

import type {
  ActorFixtureData,
  Citation,
  FixtureKind,
  ItemFixtureData,
  Json,
  TemplateParam,
} from '@rules-engine-kit/engine';
import { relations } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sources } from './sources';

export const fixtures = sqliteTable(
  'fixtures',
  {
    /**
     * `<kind>:<slug>:<scope joined by +>`. The scope is part of the key because a slug is not
     * one: `goblin` is two actor fixtures, one scoped to each edition, which is how ADR-0026
     * says a stat block that genuinely differs is written (ADR-0027).
     */
    id: text('id').primaryKey(),
    slug: text('slug').notNull(),
    kind: text('kind', { enum: ['actor', 'item'] })
      .$type<FixtureKind>()
      .notNull(),
    /** The profile slugs this fixture is valid under, in authored order (ADR-0026). */
    rulesetScope: text('ruleset_scope', { mode: 'json' }).$type<string[]>().notNull(),
    /** Printed values only (FR-8): what the stat block or the equipment table says. */
    data: text('data', { mode: 'json' }).$type<ActorFixtureData | ItemFixtureData>().notNull(),
    citation: text('citation', { mode: 'json' }).$type<Citation>().notNull(),
    /** Why these numbers, when the citation alone does not account for them (ADR-0026). */
    interpretation: text('interpretation'),
    sourceId: text('source_id')
      .notNull()
      .references(() => sources.id),
  },
  (table) => [index('fixtures_slug_idx').on(table.slug)],
);

export const templates = sqliteTable('templates', {
  /** The template's `id`, which is its slug. */
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** One or two sentences, as `/templates` lists it (ADR-0028). */
  description: text('description').notNull(),
  tags: text('tags', { mode: 'json' }).$type<string[]>().notNull(),
  /** `Template.params`: the typed params a form is generated from (FR-19). */
  paramsSchema: text('params_schema', { mode: 'json' })
    .$type<Record<string, TemplateParam>>()
    .notNull(),
  /** A situation with holes in it, Situation-shaped (ADR-0026). */
  skeleton: text('skeleton', { mode: 'json' }).$type<Json>().notNull(),
  suggestedProfiles: text('suggested_profiles', { mode: 'json' }).$type<string[]>().notNull(),
  /** `TEMPLATE_SCHEMA_VERSION` at the time the row was seeded (VR-8). */
  schemaVersion: integer('schema_version').notNull(),
});

export const fixturesRelations = relations(fixtures, ({ one }) => ({
  source: one(sources, { fields: [fixtures.sourceId], references: [sources.id] }),
}));

export type FixtureRow = typeof fixtures.$inferSelect;
export type TemplateRow = typeof templates.$inferSelect;
