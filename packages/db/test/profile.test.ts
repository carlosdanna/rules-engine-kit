/**
 * The app evaluates from the database, not from `content/` (ADR-0030), so a profile rebuilt
 * from the seeded rows has to be the profile that was seeded. The resolved hash is the proof:
 * it is taken over every resolved rule and the layer identities (ADR-0009), and it is what a
 * stored run records (VR-7).
 */

import { evaluate, resolveProfile } from '@rules-engine-kit/engine';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { loadResolvedProfile, loadStack, StaleProfileError } from '../src/profile';
import { profiles, rulesetVersions } from '../src/schema';
import { seedDatabase } from '../src/seed';
import { openTestDb, seedContent } from './seed/helpers';

describe('loadResolvedProfile', () => {
  it('rebuilds every seeded profile to the hash it was seeded with', () => {
    const database = openTestDb();
    try {
      seedDatabase(database.db, seedContent());
      const rows = database.db.select().from(profiles).all();
      expect(rows.length).toBeGreaterThan(0);

      for (const row of rows) {
        const loaded = loadResolvedProfile(database.db, row.id);
        expect(loaded.profile.hash, row.id).toBe(row.resolvedHash);
        expect(loaded.storedHash).toBe(row.resolvedHash);
      }
    } finally {
      database.close();
    }
  });

  it('carries the merged fact registry, so a seeded scenario evaluates as it does from files', () => {
    const database = openTestDb();
    try {
      const content = seedContent();
      seedDatabase(database.db, content);

      const manifest = content.profiles.find((profile) => profile.slug === 'srd-5.2.1');
      const stack = (manifest?.layers ?? []).map(
        (layer) =>
          content.packs.find((p) => p.id === layer.id && p.version === layer.version) ??
          (() => {
            throw new Error(`no pack ${layer.id}`);
          })(),
      );
      const scenario = content.scenarios[0];
      if (scenario === undefined) throw new Error('no scenarios seeded');

      const fromFiles = evaluate(scenario.situation, resolveProfile(stack), {
        seed: 'db-parity',
        facts: stack.flatMap((pack) => pack.facts),
      });
      const loaded = loadResolvedProfile(database.db, 'srd-5.2.1');
      const fromRows = evaluate(scenario.situation, loaded.profile, {
        seed: 'db-parity',
        facts: loaded.facts,
      });

      expect(fromRows).toEqual(fromFiles);
    } finally {
      database.close();
    }
  });

  it('refuses a profile it cannot find', () => {
    const database = openTestDb();
    try {
      seedDatabase(database.db, seedContent());
      expect(() => loadResolvedProfile(database.db, 'no-such-profile')).toThrow(/no profile/);
    } finally {
      database.close();
    }
  });

  it('refuses a version migrated but not yet reseeded, whose registry is empty', () => {
    const database = openTestDb();
    try {
      seedDatabase(database.db, seedContent());
      database.db.update(rulesetVersions).set({ facts: [] }).run();
      expect(() => loadResolvedProfile(database.db, 'srd-5.1')).toThrow(StaleProfileError);
      expect(() => loadResolvedProfile(database.db, 'srd-5.1')).toThrow(/pnpm db:reset/);
    } finally {
      database.close();
    }
  });

  it('reports the stored hash separately, so a caller can tell the rows have drifted', () => {
    const database = openTestDb();
    try {
      seedDatabase(database.db, seedContent());
      database.db
        .update(profiles)
        .set({ resolvedHash: 'sha256:stale' })
        .where(eq(profiles.id, 'srd-5.1'))
        .run();
      const loaded = loadResolvedProfile(database.db, 'srd-5.1');
      expect(loaded.storedHash).toBe('sha256:stale');
      expect(loaded.profile.hash).not.toBe('sha256:stale');
    } finally {
      database.close();
    }
  });
});

describe('loadStack', () => {
  it('rebuilds an unsaved stack to the hash the same seeded stack resolves to', () => {
    const database = openTestDb();
    try {
      seedDatabase(database.db, seedContent());
      const stack = loadStack(database.db, ['dnd5e-srd@5.2.1', 'house-flanking@1.0.0']);

      expect(stack.map((pack) => `${pack.id}@${pack.version}`)).toEqual([
        'dnd5e-srd@5.2.1',
        'house-flanking@1.0.0',
      ]);
      expect(resolveProfile(stack).hash).toBe(
        loadResolvedProfile(database.db, 'srd-5.2.1+flanking').storedHash,
      );
    } finally {
      database.close();
    }
  });

  it('keeps the order it was given, so a caller can build an incompatible stack and see why', () => {
    const database = openTestDb();
    try {
      seedDatabase(database.db, seedContent());
      const stack = loadStack(database.db, ['house-flanking@1.0.0', 'dnd5e-srd@5.1.0']);
      expect(stack[0]?.id).toBe('house-flanking');
    } finally {
      database.close();
    }
  });

  it('refuses a version id with no row', () => {
    const database = openTestDb();
    try {
      seedDatabase(database.db, seedContent());
      expect(() => loadStack(database.db, ['dnd5e-srd@9.9.9'])).toThrow(/no ruleset version/);
    } finally {
      database.close();
    }
  });
});
