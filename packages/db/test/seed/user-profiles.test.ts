/**
 * A user profile across a rebuild (ADR-0004, ADR-0031).
 *
 * `/profiles` writes a `profiles` row with `origin = 'user'` and its `profile_layers`, which
 * point at seeded `ruleset_versions`. A reseed deletes and rewrites those versions under the
 * same ids (ADR-0027), so the layers have to survive it — and because the rebuilt rules may
 * differ, the user profile's `resolved_hash` is taken again from what its layers now resolve
 * to, exactly as a seeded profile's is. Otherwise the remedy every stale-hash refusal names,
 * `pnpm db:reset`, could never fix a user profile.
 */

import { asc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { LoadedContent } from '../../src/content';
import { profileLayers, profiles } from '../../src/schema/profiles';
import { seedDatabase } from '../../src/seed';
import { openTestDb, seedContent, type TestDb } from './helpers';

function writeUserProfile(database: TestDb, versionIds: string[]): void {
  database.db
    .insert(profiles)
    .values({
      id: 'my-stack',
      name: 'My stack',
      resolvedHash: 'sha256:placeholder',
      origin: 'user',
    })
    .run();
  database.db
    .insert(profileLayers)
    .values(
      versionIds.map((rulesetVersionId, position) => ({
        profileId: 'my-stack',
        rulesetVersionId,
        position,
      })),
    )
    .run();
}

const hashOf = (database: TestDb, id: string) =>
  database.db.select().from(profiles).where(eq(profiles.id, id)).all()[0]?.resolvedHash;

/** The same tree with one house-flanking rule's priority moved, so its resolved hash moves. */
function withFlankingChanged(content: LoadedContent): LoadedContent {
  return {
    ...content,
    packs: content.packs.map((pack) =>
      pack.id !== 'house-flanking'
        ? pack
        : {
            ...pack,
            rules: pack.rules.map((entry, index) =>
              index === 0 && 'priority' in entry && entry.priority !== undefined
                ? { ...entry, priority: entry.priority + 1 }
                : entry,
            ),
          },
    ),
  };
}

describe('a user profile across db:reset', () => {
  it('keeps its layers, in order', () => {
    const database = openTestDb();
    try {
      seedDatabase(database.db, seedContent());
      writeUserProfile(database, ['dnd5e-srd@5.2.1', 'house-flanking@1.0.0']);

      seedDatabase(database.db, seedContent(), { guardPublished: false });

      const layers = database.db
        .select()
        .from(profileLayers)
        .where(eq(profileLayers.profileId, 'my-stack'))
        .orderBy(asc(profileLayers.position))
        .all();
      expect(layers.map((layer) => layer.rulesetVersionId)).toEqual([
        'dnd5e-srd@5.2.1',
        'house-flanking@1.0.0',
      ]);
    } finally {
      database.close();
    }
  });

  it('takes its hash again from what the rebuilt layers resolve to', () => {
    const database = openTestDb();
    try {
      seedDatabase(database.db, seedContent());
      writeUserProfile(database, ['dnd5e-srd@5.2.1', 'house-flanking@1.0.0']);

      seedDatabase(database.db, seedContent(), { guardPublished: false });
      expect(hashOf(database, 'my-stack')).toBe(hashOf(database, 'srd-5.2.1+flanking'));

      const before = hashOf(database, 'srd-5.2.1+flanking');
      seedDatabase(database.db, withFlankingChanged(seedContent()), { guardPublished: false });
      expect(hashOf(database, 'srd-5.2.1+flanking')).not.toBe(before);
      expect(hashOf(database, 'my-stack')).toBe(hashOf(database, 'srd-5.2.1+flanking'));
    } finally {
      database.close();
    }
  });

  it('names a user profile whose layer content/ no longer declares, and changes nothing', () => {
    const database = openTestDb();
    try {
      const content = seedContent();
      seedDatabase(database.db, content);
      writeUserProfile(database, ['dnd5e-srd@5.2.1', 'house-flanking@1.0.0']);

      const without = {
        ...content,
        packs: content.packs.filter((pack) => pack.id !== 'house-flanking'),
        profiles: content.profiles.filter((profile) =>
          profile.layers.every((layer) => layer.id !== 'house-flanking'),
        ),
      };

      expect(() => seedDatabase(database.db, without, { guardPublished: false })).toThrow(
        /my-stack.*house-flanking@1\.0\.0/s,
      );
      expect(hashOf(database, 'my-stack')).toBe('sha256:placeholder');
    } finally {
      database.close();
    }
  });
});
