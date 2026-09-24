/**
 * Rulesets, their versions and the rules each version declares (VR-1, VR-2).
 *
 * A ruleset is a slug across versions — `dnd5e-srd` is 5.1.0 *and* 5.2.1 — so everything that
 * differs between editions hangs off `ruleset_versions`, including the source it is attributed
 * to (ADR-0027).
 *
 * `rules` stores one row per authored `RuleEntry`, and an entry is one of four ops. `add` and
 * `override` carry a whole body and fill the body columns; `disable` carries only a `reason`;
 * `patch` carries a whitelisted subset (ADR-0009) and goes in `patch` as authored, because the
 * difference between a field a patch left alone and one it set to null is the difference
 * between two different patches. Every value therefore has exactly one home, and a
 * `RulesetVersion` read back out of these rows resolves to the hash it was seeded with.
 */

import type {
  Citation,
  Condition,
  Effect,
  FactDefinition,
  Phase,
  RuleEntry,
  RuleOp,
} from '@rules-engine-kit/engine';
import { relations } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sources } from './sources';

export const rulesets = sqliteTable('rulesets', {
  /** The pack's `id`, which is its slug: `dnd5e-srd`, `house-flanking` (ADR-0027). */
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  kind: text('kind', { enum: ['base', 'layer'] }).notNull(),
});

export const rulesetVersions = sqliteTable(
  'ruleset_versions',
  {
    /** `<rulesetId>@<semver>`. */
    id: text('id').primaryKey(),
    rulesetId: text('ruleset_id')
      .notNull()
      .references(() => rulesets.id),
    semver: text('semver').notNull(),
    /**
     * The base this layer extends, as `pack.yaml`'s `extends: { id, range }` — null on a base.
     *
     * `architecture.md` called the first of these `base_version_id`; it cannot be one. A layer
     * declares a *range* of compatible base versions (VR-3), and the range this repository's
     * house rule declares, `>=5.1.0`, matches both seeded SRD versions on purpose (ADR-0018).
     * There is no single base version to point at, so the column names the ruleset and the
     * range says which of its versions (ADR-0027).
     */
    baseRulesetId: text('base_ruleset_id'),
    baseRange: text('base_range'),
    /** `sha256Hex(canonicalJson(pack))`; `db:seed` refuses to change it (ADR-0027, VR-1). */
    contentHash: text('content_hash').notNull(),
    /**
     * The pack's fact registry (`facts.yaml`), in declared order. `evaluate` cannot run
     * without it, and the app builds its profiles from these rows rather than from
     * `content/` on disk (ADR-0030).
     */
    facts: text('facts', { mode: 'json' }).$type<FactDefinition[]>().notNull(),
    sourceId: text('source_id')
      .notNull()
      .references(() => sources.id),
  },
  (table) => [index('ruleset_versions_ruleset_idx').on(table.rulesetId)],
);

export const rules = sqliteTable(
  'rules',
  {
    /** `<rulesetVersionId>#<ruleKey>`: one entry per key per version (ADR-0009). */
    id: text('id').primaryKey(),
    rulesetVersionId: text('ruleset_version_id')
      .notNull()
      .references(() => rulesetVersions.id),
    ruleKey: text('rule_key').notNull(),
    op: text('op', { enum: ['add', 'override', 'patch', 'disable'] })
      .$type<RuleOp>()
      .notNull(),

    // The body: present on `add` and `override`, null on `patch` and `disable`.
    phase: text('phase').$type<Phase>(),
    priority: integer('priority'),
    label: text('label'),
    description: text('description'),
    tags: text('tags', { mode: 'json' }).$type<string[]>(),
    /** `null` on a rule that always applies once selected — same meaning as in the schema. */
    condition: text('condition', { mode: 'json' }).$type<Condition | null>(),
    effects: text('effects', { mode: 'json' }).$type<Effect[]>(),
    citation: text('citation', { mode: 'json' }).$type<Citation>(),
    interpretation: text('interpretation'),

    /** The authored patch, verbatim: only its own declared fields (ADR-0009). */
    patch: text('patch', { mode: 'json' }).$type<Extract<RuleEntry, { op: 'patch' }>>(),
    /** Why a layer switched a rule off; `null` when it gave no reason. */
    reason: text('reason'),
  },
  (table) => [
    index('rules_version_idx').on(table.rulesetVersionId),
    index('rules_key_idx').on(table.ruleKey),
  ],
);

export const rulesetsRelations = relations(rulesets, ({ many }) => ({
  versions: many(rulesetVersions),
}));

export const rulesetVersionsRelations = relations(rulesetVersions, ({ one, many }) => ({
  ruleset: one(rulesets, { fields: [rulesetVersions.rulesetId], references: [rulesets.id] }),
  source: one(sources, { fields: [rulesetVersions.sourceId], references: [sources.id] }),
  rules: many(rules),
}));

export const rulesRelations = relations(rules, ({ one }) => ({
  version: one(rulesetVersions, {
    fields: [rules.rulesetVersionId],
    references: [rulesetVersions.id],
  }),
}));

export type RulesetRow = typeof rulesets.$inferSelect;
export type RulesetVersionRow = typeof rulesetVersions.$inferSelect;
export type RuleRow = typeof rules.$inferSelect;
