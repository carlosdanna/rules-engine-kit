/**
 * VR-1, enforced: a published ruleset version's content does not change (ADR-0027).
 *
 * `db:seed` runs this before it writes. `db:reset` does not — it rebuilds the seeded rows
 * rather than comparing them, which is what makes it the escape hatch while content is being
 * written. The distinction is the whole difference between the two commands on an existing
 * database, and it is why the message names both the fix and the escape.
 */

import { sql } from 'drizzle-orm';
import type { Db } from '../client';
import { rulesetVersions } from '../schema/rulesets';
import type { SeedRows } from './rows';

export class PublishedContentChangedError extends Error {
  readonly code = 'PUBLISHED_CONTENT_CHANGED';

  constructor(message: string) {
    super(message);
    this.name = 'PublishedContentChangedError';
  }
}

export function assertContentUnchanged(db: Db, rows: SeedRows['rulesetVersions']): void {
  const stored = new Map(
    db
      .select({ id: rulesetVersions.id, contentHash: rulesetVersions.contentHash })
      .from(rulesetVersions)
      .all()
      .map((row) => [row.id, row.contentHash] as const),
  );

  for (const row of rows) {
    const was = stored.get(row.id);
    if (was === undefined || was === row.contentHash) continue;

    throw new PublishedContentChangedError(
      `${row.id} is already seeded with different content (VR-1: a ruleset version is immutable).\n` +
        `  seeded:  ${was}\n` +
        `  content: ${row.contentHash}\n` +
        `Bump ${row.rulesetId}'s version in its pack.yaml to publish this as a new version, ` +
        'or run `pnpm db:reset` to rebuild the seeded rows from content/.',
    );
  }
}

/** True when the database has no schema yet, so there is nothing to compare against. */
export function hasBeenSeeded(db: Db): boolean {
  const found = db.all<{ name: string }>(
    sql`select name from sqlite_master where type = 'table' and name = 'ruleset_versions'`,
  );
  return found.length > 0;
}
