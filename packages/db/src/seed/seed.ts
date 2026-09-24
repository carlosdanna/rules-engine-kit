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
 * `profiles` and `scenarios` are shared, so only their `origin = 'seed'` rows are touched, and
 * only a seeded profile's `profile_layers`. The other seeded tables hold nothing a user can
 * write and are cleared wholesale.
 *
 * A user profile's layers point at seeded `ruleset_versions`, which come back under the same
 * ids; its `resolved_hash` is then taken again from what those layers now resolve to, as a
 * seeded profile's is (ADR-0031).
 */

import { IncompatibleStackError, resolveProfile } from '@rules-engine-kit/engine';
import { asc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../client';
import type { LoadedContent } from '../content';
import { ContentLoadError } from '../content/errors';
import { loadStack } from '../profile';
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
  const seededProfiles = db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.origin, 'seed'));
  db.delete(profileLayers).where(inArray(profileLayers.profileId, seededProfiles)).run();
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

/**
 * Every user profile's layers must name a version the rebuild wrote back. Checked here, inside
 * the transaction, rather than left to the deferred foreign key, whose message names nothing.
 */
function assertUserLayersResolve(db: Db, rows: SeedRows): void {
  const incoming = new Set(rows.rulesetVersions.map((version) => version.id));
  const orphans = db
    .select({ profileId: profileLayers.profileId, versionId: profileLayers.rulesetVersionId })
    .from(profileLayers)
    .innerJoin(profiles, eq(profileLayers.profileId, profiles.id))
    .where(eq(profiles.origin, 'user'))
    .all()
    .filter((layer) => !incoming.has(layer.versionId));
  if (orphans.length === 0) return;

  const listed = orphans.map((row) => `  '${row.profileId}' → ${row.versionId}`).join('\n');
  throw new ContentLoadError(
    `these user profiles stack ruleset versions that content/ no longer declares:\n${listed}\n` +
      'Nothing was changed. Delete them on /profiles, or discard them with `pnpm db:reset --hard`.',
  );
}

/**
 * A user profile's hash, taken again over the rebuilt rules. A stack the new content makes
 * incompatible keeps its old hash: the app refuses to run it and `/profiles` says why, which is
 * more use to the author than a reseed that fails over a profile they can delete.
 */
function rehashUserProfiles(db: Db): void {
  const users = db.select().from(profiles).where(eq(profiles.origin, 'user')).all();
  for (const profile of users) {
    const layers = db
      .select({ versionId: profileLayers.rulesetVersionId })
      .from(profileLayers)
      .where(eq(profileLayers.profileId, profile.id))
      .orderBy(asc(profileLayers.position))
      .all();
    if (layers.length === 0) continue;

    let hash: string;
    try {
      hash = resolveProfile(
        loadStack(
          db,
          layers.map((layer) => layer.versionId),
        ),
      ).hash;
    } catch (thrown) {
      if (thrown instanceof IncompatibleStackError) continue;
      throw thrown;
    }
    db.update(profiles).set({ resolvedHash: hash }).where(eq(profiles.id, profile.id)).run();
  }
}

export type SeedOptions = {
  /**
   * Refuse to change a ruleset version already seeded under a different content hash (VR-1).
   * `db:seed` passes true; `db:reset` rebuilds and passes false (ADR-0027).
   */
  guardPublished: boolean;
};

export type SeedSummary = Record<keyof SeedRows, number>;

/**
 * Turn a deferred foreign-key failure into something the author can act on.
 *
 * The check runs at the commit, so SQLite reports `FOREIGN KEY constraint failed` and names
 * neither the row nor the table. In practice there is one way for a rebuild to produce it: a
 * user scenario created from a template (ADR-0029) whose template has since left `content/`,
 * so the id it references is not among the rows being written back. Re-reading the scenarios
 * after the rollback is cheap and turns the message into a list of names.
 *
 * Anything else is rethrown untouched — a guess dressed up as a diagnostic is worse than the
 * original error.
 */
function explainOrphans(db: Db, rows: SeedRows, thrown: unknown): unknown {
  if (!/FOREIGN KEY constraint failed/i.test(String(thrown))) return thrown;

  const incoming = new Set(rows.templates.map((template) => template.id));
  const orphans = db
    .select({ id: scenarios.id, name: scenarios.name, templateId: scenarios.templateId })
    .from(scenarios)
    .where(eq(scenarios.origin, 'user'))
    .all()
    .filter((row) => row.templateId !== null && !incoming.has(row.templateId));

  if (orphans.length === 0) return thrown;

  const listed = orphans
    .map((row) => `  '${row.id}' (${row.name}) → template '${row.templateId}'`)
    .join('\n');

  return new ContentLoadError(
    `these user scenarios were built from templates that content/ no longer declares:\n${listed}\n` +
      'Nothing was changed. Re-save each one from the app (it stores the situation either way, ' +
      'ADR-0017), or discard them with `pnpm db:reset --hard`.',
  );
}

export function seedDatabase(
  db: Db,
  content: LoadedContent,
  options: SeedOptions = { guardPublished: true },
): SeedSummary {
  const rows = rowsFromContent(content);

  if (options.guardPublished) assertContentUnchanged(db, rows.rulesetVersions);

  try {
    db.transaction((tx) => {
      tx.run('PRAGMA defer_foreign_keys = ON');
      deleteSeeded(tx as unknown as Db);
      insertSeeded(tx as unknown as Db, rows);
      assertUserLayersResolve(tx as unknown as Db, rows);
      rehashUserProfiles(tx as unknown as Db);
    });
  } catch (thrown) {
    throw explainOrphans(db, rows, thrown);
  }

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
