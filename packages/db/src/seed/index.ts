/**
 * `content/` and `scenarios/` → the seeded rows (ADR-0004). The commands in `../bin/` are thin
 * wrappers around `runSeed`; everything interesting is testable without a process.
 */

import { openDb } from '../client';
import type { LoadedContent } from '../content';
import { loadContentTree } from '../content';
import { CONTENT_DIR, SCENARIOS_DIR } from '../paths';
import { migrateDatabase } from './migrate';
import { type SeedSummary, seedDatabase, wipeDatabase } from './seed';

export { contentHashOf } from './contentHash';
export { assertContentUnchanged, PublishedContentChangedError } from './guard';
export { fixtureId, packVersionId, ruleId, versionId } from './ids';
export { migrateDatabase } from './migrate';
export { rowsFromContent, ruleRow, type SeedRows } from './rows';
export { type SeedOptions, type SeedSummary, seedDatabase, wipeDatabase } from './seed';

/** The repository's own tree, which is what every command seeds from. */
export function loadSeedContent(): LoadedContent {
  return loadContentTree(CONTENT_DIR, SCENARIOS_DIR);
}

export type RunSeedOptions = {
  /** `db:seed` guards a published version's content hash; `db:reset` rebuilds (ADR-0027). */
  guardPublished: boolean;
  /** `db:reset --hard`: drop the user rows too, before reseeding. */
  hard?: boolean;
  dbPath?: string;
};

export function runSeed(options: RunSeedOptions): SeedSummary {
  const { db, sqlite } = openDb(options.dbPath);
  try {
    migrateDatabase(db);
    if (options.hard === true) wipeDatabase(db);
    return seedDatabase(db, loadSeedContent(), { guardPublished: options.guardPublished });
  } finally {
    sqlite.close();
  }
}
