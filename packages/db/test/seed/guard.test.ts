/**
 * VR-1 at the database boundary: a published pack version's content does not change
 * (ADR-0027).
 *
 * The mutation is done to the *stored* hash rather than to `content/`, because the thing under
 * test is what `db:seed` does when the two disagree — and editing the real content tree from a
 * test would make every other suite depend on the order they run in.
 */

import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { rulesetVersions } from '../../src/schema/rulesets';
import { PublishedContentChangedError, rowsFromContent, seedDatabase } from '../../src/seed';
import { openTestDb, seedContent } from './helpers';

const PUBLISHED = 'dnd5e-srd@5.2.1';

describe('db:seed refuses to change a published version (VR-1, ADR-0027)', () => {
  it('names the version, both hashes, and the two ways out', () => {
    const database = openTestDb();
    try {
      seedDatabase(database.db, seedContent());
      database.db
        .update(rulesetVersions)
        .set({ contentHash: 'sha256:what-was-seeded-before' })
        .where(eq(rulesetVersions.id, PUBLISHED))
        .run();

      expect(() => seedDatabase(database.db, seedContent())).toThrow(PublishedContentChangedError);

      try {
        seedDatabase(database.db, seedContent());
      } catch (thrown) {
        const message = (thrown as Error).message;
        expect(message).toContain(PUBLISHED);
        expect(message).toContain('sha256:what-was-seeded-before');
        expect(message).toContain('VR-1');
        expect(message).toContain('pnpm db:reset');
      }
    } finally {
      database.close();
    }
  });

  it('db:reset rebuilds instead of refusing, which is what makes it the escape hatch', () => {
    const database = openTestDb();
    try {
      seedDatabase(database.db, seedContent());
      database.db
        .update(rulesetVersions)
        .set({ contentHash: 'sha256:what-was-seeded-before' })
        .where(eq(rulesetVersions.id, PUBLISHED))
        .run();

      expect(() =>
        seedDatabase(database.db, seedContent(), { guardPublished: false }),
      ).not.toThrow();

      const expected = rowsFromContent(seedContent()).rulesetVersions.find(
        (row) => row.id === PUBLISHED,
      );
      const [stored] = database.db
        .select()
        .from(rulesetVersions)
        .where(eq(rulesetVersions.id, PUBLISHED))
        .all();
      expect(stored?.contentHash).toBe(expected?.contentHash);
    } finally {
      database.close();
    }
  });

  it('a first seed has nothing to compare against and is never refused', () => {
    const database = openTestDb();
    try {
      expect(() => seedDatabase(database.db, seedContent())).not.toThrow();
    } finally {
      database.close();
    }
  });
});
