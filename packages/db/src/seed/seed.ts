/**
 * Writing the seeded rows (ADR-0004, ADR-0027).
 *
 * One function serves both `db:seed` and `db:reset`, because on an existing database they do
 * the same thing: delete the seeded rows and write them again. A rebuild rather than an
 * upsert-and-sweep, so "reseeding twice yields identical rows" is structural — there is no
 * update path that could leave a column behind from a previous shape of the content.
 *
 * Two pragmas make that safe. `foreign_keys` is on (see `client.ts`), so nothing can leave a
 * user row pointing at a parent that no longer exists; `defer_foreign_keys` holds the check
 * until the commit, which is what lets the rebuild delete a seeded `scenario` a user
 * `evaluation` references and put it back — under the same deterministic id — inside the one
 * transaction. Without the deferral the delete would fail; without the deterministic id the
 * re-insert would not satisfy the reference.
 *
 * `profiles` and `scenarios` are shared, so only their `origin = 'seed'` rows are touched. The
 * other seeded tables hold nothing a user can write and are cleared wholesale.
 */

import { eq } from 'drizzle-orm';
import type { Db } from '../client';
import type { LoadedContent } from '../content';
import { fixtures, templates } from '../schema/content';
import { profileLayers, profiles } from '../schema/profiles';
import { rules, rulesets, rulesetVersions } from '../schema/rulesets';
import { evaluations, scenarios } from '../schema/scenarios';
import { sources } from '../schema/sources';
import { assertContentUnchanged } from './guard';
import { rowsFromContent, type SeedRows } from './rows';

/** SQLite has a variable limit per statement; content this size is nowhere near it, but a
 * chunked insert keeps that true as the packs grow. */
const CHUNK = 200;

function insertAll<T>(rows: readonly T[], write: (batch: T[]) => void): void {
  for (let index = 0; index < rows.length; index += CHUNK) {
    const batch = rows.slice(index, index + CHUNK);
    if (batch.length > 0) write(batch);
  }
}

/** Children before parents. The deferral makes the order a courtesy rather than a constraint,
 * but a readable order is what someone debugging a failed commit needs. */
function deleteSeeded(db: Db): void {
  db.delete(profileLayers).run();
  db.delete(scenarios).where(eq(scenarios.origin, 'seed')).run();
  db.delete(rules).run();
  db.delete(templates).run();
  db.delete(fixtures).run();
  db.delete(profiles).where(eq(profiles.origin, 'seed')).run();
  db.delete(rulesetVersions).run();
  db.delete(rulesets).run();
  db.delete(sources).run();
}

function insertSeeded(db: Db, rows: SeedRows): void {
  insertAll(rows.sources, (batch) => db.insert(sources).values(batch).run());
  insertAll(rows.rulesets, (batch) => db.insert(rulesets).values(batch).run());
  insertAll(rows.rulesetVersions, (batch) => db.insert(rulesetVersions).values(batch).run());
  insertAll(rows.rules, (batch) => db.insert(rules).values(batch).run());
  insertAll(rows.fixtures, (batch) => db.insert(fixtures).values(batch).run());
  insertAll(rows.templates, (batch) => db.insert(templates).values(batch).run());
  insertAll(rows.profiles, (batch) => db.insert(profiles).values(batch).run());
  insertAll(rows.profileLayers, (batch) => db.insert(profileLayers).values(batch).run());
  insertAll(rows.scenarios, (batch) => db.insert(scenarios).values(batch).run());
}

export type SeedOptions = {
  /**
   * Refuse to change a ruleset version already seeded under a different content hash (VR-1).
   * `db:seed` passes true; `db:reset` rebuilds and passes false (ADR-0027).
   */
  guardPublished: boolean;
};

export type SeedSummary = Record<keyof SeedRows, number>;

export function seedDatabase(
  db: Db,
  content: LoadedContent,
  options: SeedOptions = { guardPublished: true },
): SeedSummary {
  const rows = rowsFromContent(content);

  if (options.guardPublished) assertContentUnchanged(db, rows.rulesetVersions);

  db.transaction((tx) => {
    tx.run('PRAGMA defer_foreign_keys = ON');
    deleteSeeded(tx as unknown as Db);
    insertSeeded(tx as unknown as Db, rows);
  });

  return {
    sources: rows.sources.length,
    rulesets: rows.rulesets.length,
    rulesetVersions: rows.rulesetVersions.length,
    rules: rows.rules.length,
    fixtures: rows.fixtures.length,
    templates: rows.templates.length,
    profiles: rows.profiles.length,
    profileLayers: rows.profileLayers.length,
    scenarios: rows.scenarios.length,
  };
}

/**
 * `db:reset --hard`: everything, including the rows a user made (ADR-0004).
 *
 * The difference from `db:reset` is exactly this function, and it is the observable one M3's
 * exit criteria ask for.
 */
export function wipeDatabase(db: Db): void {
  db.transaction((tx) => {
    tx.run('PRAGMA defer_foreign_keys = ON');
    tx.delete(evaluations).run();
    tx.delete(profileLayers).run();
    tx.delete(scenarios).run();
    tx.delete(rules).run();
    tx.delete(templates).run();
    tx.delete(fixtures).run();
    tx.delete(profiles).run();
    tx.delete(rulesetVersions).run();
    tx.delete(rulesets).run();
    tx.delete(sources).run();
  });
}
