/**
 * Named profiles and their ordered layer stacks (ADR-0026, FR-2).
 *
 * Shared between seed and user (ADR-0004): the four in `content/profiles.yaml` are seeded, and
 * `/profiles` writes more. `origin` is what `db:seed` and `db:reset` filter on, so a stack a
 * user built survives a rebuild of the content they built it from.
 *
 * `resolved_hash` is `resolveProfile(layers).hash` — the canonical JSON of the resolved rules
 * plus the layer identities (ADR-0009). It is a different number from a pack's `content_hash`
 * and answers a different question: what the merge produced, not what was authored.
 */

import { relations } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { rulesetVersions } from './rulesets';

export const profiles = sqliteTable('profiles', {
  /** The profile slug: `srd-5.1`, `srd-5.2.1+flanking` (ADR-0026, ADR-0027). */
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  resolvedHash: text('resolved_hash').notNull(),
  origin: text('origin', { enum: ['seed', 'user'] }).notNull(),
});

export const profileLayers = sqliteTable(
  'profile_layers',
  {
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id),
    rulesetVersionId: text('ruleset_version_id')
      .notNull()
      .references(() => rulesetVersions.id),
    /** 0 is the base; layers follow in declared order (ADR-0018). */
    position: integer('position').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.profileId, table.position] }),
    index('profile_layers_version_idx').on(table.rulesetVersionId),
  ],
);

export const profilesRelations = relations(profiles, ({ many }) => ({
  layers: many(profileLayers),
}));

export const profileLayersRelations = relations(profileLayers, ({ one }) => ({
  profile: one(profiles, { fields: [profileLayers.profileId], references: [profiles.id] }),
  version: one(rulesetVersions, {
    fields: [profileLayers.rulesetVersionId],
    references: [rulesetVersions.id],
  }),
}));

export type ProfileRow = typeof profiles.$inferSelect;
export type ProfileLayerRow = typeof profileLayers.$inferSelect;
