/**
 * ADR-0004's promise, from both sides: `db:reset` rebuilds the seeded rows and leaves the user
 * ones alone, and `db:reset --hard` observably differs.
 *
 * The evaluation is the interesting row. It points at a *seeded* scenario and a *seeded*
 * profile, both of which the rebuild deletes and writes again — so this is also the test that
 * the deferred foreign-key transaction in `seed.ts` and the deterministic ids in ADR-0027 do
 * together what either alone would not.
 */

import {
  ENGINE_VERSION,
  type Outcome,
  SITUATION_SCHEMA_VERSION,
  type Situation,
  TRACE_SCHEMA_VERSION,
} from '@rules-engine-kit/engine';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { profiles } from '../../src/schema/profiles';
import { evaluations, scenarios } from '../../src/schema/scenarios';
import { seedDatabase, wipeDatabase } from '../../src/seed';
import { openTestDb, seedContent, type TestDb } from './helpers';

const USER_PROFILE = {
  id: 'my-table-rules',
  name: 'My table, house rules on 5.2.1',
  resolvedHash: 'sha256:not-a-real-hash',
  origin: 'user',
} satisfies typeof profiles.$inferInsert;

/**
 * A minimal but *typed* outcome. What this suite asserts is what a rebuild does to a row, not
 * what a run produced — `evaluations.test.ts` stores a real one — and an empty world is the
 * smallest thing the schema calls an outcome.
 */
function evaluatedOutcome(): Outcome {
  return {
    steps: [],
    finalState: { actors: {}, activeEffects: [] },
    derived: [],
    events: [],
    seed: 'demo',
    profileHash: 'sha256:whatever-it-was-at-the-time',
    engineVersion: ENGINE_VERSION,
    traceSchemaVersion: TRACE_SCHEMA_VERSION,
  };
}

/** A situation the engine produced, so the row is the shape the app would really write. */
function userSituation(): Situation {
  const rendered = seedContent().scenarios[0]?.situation;
  if (rendered === undefined) throw new Error('no seeded scenarios to borrow a situation from');
  return rendered;
}

function writeUserRows(database: TestDb): void {
  database.db.insert(profiles).values(USER_PROFILE).run();
  database.db
    .insert(scenarios)
    .values({
      id: 'my-fight',
      name: 'The fight I am actually running',
      situation: userSituation(),
      templateId: 'melee-attack',
      params: { rangeFt: 10 },
      origin: 'user',
      schemaVersion: SITUATION_SCHEMA_VERSION,
    })
    .run();
  database.db
    .insert(evaluations)
    .values({
      id: 'evaluation-1',
      // A *seeded* scenario, so the rebuild has to delete and restore the row it references.
      scenarioId: 'melee-attack',
      profileId: 'srd-5.1',
      profileHash: 'sha256:whatever-it-was-at-the-time',
      seed: 'demo',
      engineVersion: ENGINE_VERSION,
      traceSchemaVersion: TRACE_SCHEMA_VERSION,
      situation: userSituation(),
      outcome: evaluatedOutcome(),
      trace: { traceSchemaVersion: TRACE_SCHEMA_VERSION, events: [] },
    })
    .run();
}

describe('db:reset leaves user rows alone (ADR-0004)', () => {
  let database: TestDb;

  beforeEach(() => {
    database = openTestDb();
    seedDatabase(database.db, seedContent());
    writeUserRows(database);
    return () => database.close();
  });

  it('keeps a user profile, a user scenario and an evaluation across a rebuild', () => {
    seedDatabase(database.db, seedContent(), { guardPublished: false });

    expect(database.db.select().from(profiles).where(eq(profiles.origin, 'user')).all()).toEqual([
      USER_PROFILE,
    ]);
    expect(
      database.db.select().from(scenarios).where(eq(scenarios.origin, 'user')).all(),
    ).toMatchObject([{ id: 'my-fight', params: { rangeFt: 10 } }]);
    expect(database.db.select().from(evaluations).all()).toHaveLength(1);
  });

  it('rebuilds the seeded rows it deleted, under the same ids (ADR-0027)', () => {
    const before = database.db.select().from(scenarios).where(eq(scenarios.origin, 'seed')).all();
    seedDatabase(database.db, seedContent(), { guardPublished: false });
    expect(database.db.select().from(scenarios).where(eq(scenarios.origin, 'seed')).all()).toEqual(
      before,
    );
  });

  it("keeps the evaluation's foreign keys pointing at rows that exist", () => {
    seedDatabase(database.db, seedContent(), { guardPublished: false });

    const violations = database.sqlite.pragma('foreign_key_check') as unknown[];
    expect(violations).toEqual([]);
  });

  it('--hard deletes the user rows, which is the observable difference (M3)', () => {
    wipeDatabase(database.db);
    seedDatabase(database.db, seedContent(), { guardPublished: false });

    expect(database.db.select().from(profiles).where(eq(profiles.origin, 'user')).all()).toEqual(
      [],
    );
    expect(database.db.select().from(evaluations).all()).toEqual([]);
    // …and the seeded rows are back, so `--hard` is a reset and not a drop.
    expect(
      database.db.select().from(profiles).where(eq(profiles.origin, 'seed')).all().length,
    ).toBeGreaterThan(0);
  });
});
