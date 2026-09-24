/**
 * One scenario under two profiles (FR-16). Seeds the real `content/`, as the evaluation suite
 * does, into an in-memory database.
 */

import { evaluations, loadSeedContent, profiles, seedDatabase } from '@rules-engine-kit/db';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { memoryDb, type TestDb } from '../scenarios/test-db';
import { compareRuns } from './run';

let database: TestDb;

beforeEach(() => {
  database = memoryDb();
  seedDatabase(database.db, loadSeedContent());
});

afterEach(() => database.close());

const input = { scenarioId: 'melee-attack', a: 'srd-5.1', b: 'srd-5.2.1', seed: 'compare' };

function hashOf(id: string) {
  return database.db.select().from(profiles).where(eq(profiles.id, id)).all()[0]?.resolvedHash;
}

describe('compareRuns', () => {
  it('runs each side under its own profile and the same seed', () => {
    const result = compareRuns(database.db, input);
    if (!result.ok) throw new Error(result.formErrors.join('\n'));

    expect(result.data.a.outcome.profileHash).toBe(hashOf('srd-5.1'));
    expect(result.data.b.outcome.profileHash).toBe(hashOf('srd-5.2.1'));
    expect(result.data.a.outcome.seed).toBe('compare');
    expect(result.data.b.outcome.seed).toBe('compare');
    expect(result.data.outcomeDiff.identity.profileHash).toEqual({
      a: hashOf('srd-5.1'),
      b: hashOf('srd-5.2.1'),
    });
  });

  it('stores nothing', () => {
    compareRuns(database.db, input);
    expect(database.db.select().from(evaluations).all()).toEqual([]);
  });

  it('finds nothing to report when both sides are the same profile', () => {
    const result = compareRuns(database.db, { ...input, b: 'srd-5.1' });
    if (!result.ok) throw new Error(result.formErrors.join('\n'));

    expect(result.data.outcomeDiff.identical).toBe(true);
    expect(result.data.traceDiff.identical).toBe(true);
  });

  it('refuses a scenario it cannot find', () => {
    const result = compareRuns(database.db, { ...input, scenarioId: 'nope' });
    expect(result).toMatchObject({ ok: false, formErrors: [expect.stringMatching(/no scenario/)] });
  });

  it('refuses a side whose rows no longer resolve to the stored hash, naming the side', () => {
    database.db
      .update(profiles)
      .set({ resolvedHash: 'sha256:stale' })
      .where(eq(profiles.id, 'srd-5.2.1'))
      .run();
    const result = compareRuns(database.db, input);
    expect(result).toMatchObject({
      ok: false,
      formErrors: [expect.stringMatching(/^B: .*srd-5\.2\.1.*pnpm db:reset/)],
    });
  });
});
