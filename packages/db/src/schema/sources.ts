/**
 * Who content is attributed to, and under what licence (NFR-6, `/credits`).
 *
 * One row per *pack version*, not per ruleset: SRD 5.1 and SRD 5.2.1 are two versions of the
 * one ruleset slug `dnd5e-srd` and share neither `sourceUrl` nor `attribution`, which is why
 * ADR-0027 moved `source_id` off `rulesets` and onto `ruleset_versions`. The three rows this
 * repository seeds are the three sections of `CREDITS.md`.
 */

import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const sources = sqliteTable('sources', {
  /** `<packId>@<semver>`, e.g. `dnd5e-srd@5.2.1` (ADR-0027). */
  id: text('id').primaryKey(),
  /** The pack's own name, e.g. `SRD 5.2.1`. */
  name: text('name').notNull(),
  /** The attributable party, from `pack.yaml`'s `author` (ADR-0028). */
  author: text('author').notNull(),
  url: text('url').notNull(),
  license: text('license').notNull(),
  /** The licence's required attribution, verbatim, as `/credits` prints it. */
  attributionText: text('attribution_text').notNull(),
});

export type SourceRow = typeof sources.$inferSelect;
export type NewSourceRow = typeof sources.$inferInsert;
