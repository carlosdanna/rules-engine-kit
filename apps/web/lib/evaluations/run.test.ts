/**
 * Running, storing and replaying an evaluation (VR-7, ADR-0030).
 *
 * Unlike `lib/scenarios/write.test.ts`, this suite seeds the repository's real `content/`: what
 * is under test is that a run the app stores is a run the engine can reproduce, and a
 * hand-built one-rule profile would prove that about nothing the app actually offers. The
 * database is still in memory, so `data/app.db` is never touched.
 */

import {
  evaluations,
  loadSeedContent,
  profiles,
  scenarios,
  seedDatabase,
} from '@rules-engine-kit/db';
import {
  ENGINE_VERSION,
  SITUATION_SCHEMA_VERSION,
  TRACE_SCHEMA_VERSION,
} from '@rules-engine-kit/engine';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { memoryDb, type TestDb } from '../scenarios/test-db';
import { deleteUserScenario } from '../scenarios/write';
import { replayEvaluation, runEvaluation } from './run';

const SCENARIO = 'melee-attack';
const PROFILE = 'srd-5.2.1';
const SEED = 'seed-42';

let database: TestDb;

beforeEach(() => {
  database = memoryDb();
  seedDatabase(database.db, loadSeedContent());
});

afterEach(() => database.close());

function run(seed = SEED) {
  const result = runEvaluation(database.db, { scenarioId: SCENARIO, profileId: PROFILE, seed });
  if (!result.ok) throw new Error(result.formErrors.join('\n'));
  return result.data;
}

describe('runEvaluation', () => {
  it('stores the four VR-7 columns and the situation it ran', () => {
    const { id } = run();
    const [row] = database.db.select().from(evaluations).where(eq(evaluations.id, id)).all();
    const [profile] = database.db.select().from(profiles).where(eq(profiles.id, PROFILE)).all();
    const [scenario] = database.db.select().from(scenarios).where(eq(scenarios.id, SCENARIO)).all();

    expect(row).toMatchObject({
      scenarioId: SCENARIO,
      profileId: PROFILE,
      profileHash: profile?.resolvedHash,
      seed: SEED,
      engineVersion: ENGINE_VERSION,
      traceSchemaVersion: TRACE_SCHEMA_VERSION,
    });
    expect(row?.situation).toEqual(scenario?.situation);
    expect(row?.trace.events.length).toBeGreaterThan(0);
  });

  it('is deterministic: the same scenario, profile and seed give the same outcome and trace', () => {
    const first = run();
    const second = run();
    expect(second.id).not.toBe(first.id);
    expect(second.outcome).toEqual(first.outcome);
    expect(second.trace).toEqual(first.trace);
  });

  it('records the seed it was given', () => {
    expect(run('another-seed').outcome.seed).toBe('another-seed');
  });

  it('refuses a profile whose rows no longer resolve to the stored hash', () => {
    database.db
      .update(profiles)
      .set({ resolvedHash: 'sha256:stale' })
      .where(eq(profiles.id, PROFILE))
      .run();
    const result = runEvaluation(database.db, {
      scenarioId: SCENARIO,
      profileId: PROFILE,
      seed: SEED,
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.formErrors.join()).toMatch(/pnpm db:reset/);
  });

  it('names a scenario or profile that does not exist', () => {
    const noScenario = runEvaluation(database.db, {
      scenarioId: 'nope',
      profileId: PROFILE,
      seed: SEED,
    });
    const noProfile = runEvaluation(database.db, {
      scenarioId: SCENARIO,
      profileId: 'nope',
      seed: SEED,
    });
    expect(!noScenario.ok && noScenario.formErrors.join()).toMatch(/no scenario 'nope'/);
    expect(!noProfile.ok && noProfile.formErrors.join()).toMatch(/no profile 'nope'/);
  });
});

describe('replayEvaluation', () => {
  it('reproduces a stored run exactly on the same engine', () => {
    const { id } = run();
    const replay = replayEvaluation(database.db, id);
    if (!replay.ok) throw new Error(replay.formErrors.join());

    expect(replay.data.comparison).toEqual({
      outcomeIdentical: true,
      traceIdentical: true,
      firstDivergentSeq: null,
      diff: null,
    });
    expect(replay.data.engineVersionChanged).toBe(false);
    expect(replay.data.profileHashChanged).toBe(false);
  });

  it('does not store the replay', () => {
    const { id } = run();
    replayEvaluation(database.db, id);
    expect(database.db.select().from(evaluations).all()).toHaveLength(1);
  });

  it('flags a run recorded under a different engine version', () => {
    const { id } = run();
    database.db
      .update(evaluations)
      .set({ engineVersion: '9.9.9' })
      .where(eq(evaluations.id, id))
      .run();
    const replay = replayEvaluation(database.db, id);
    expect(replay.ok && replay.data.engineVersionChanged).toBe(true);
  });

  it('replays the stored situation, not the scenario as edited since', () => {
    const { id } = run();
    const [row] = database.db.select().from(scenarios).where(eq(scenarios.id, SCENARIO)).all();
    if (row === undefined) throw new Error('no scenario');
    database.db
      .update(scenarios)
      .set({ situation: { ...row.situation, timeline: row.situation.timeline.slice(0, 0) } })
      .where(eq(scenarios.id, SCENARIO))
      .run();

    const replay = replayEvaluation(database.db, id);
    expect(replay.ok && replay.data.comparison.outcomeIdentical).toBe(true);
  });

  it('points at the first trace event that diverges', () => {
    const { id, trace } = run();
    const tampered = {
      ...trace,
      events: trace.events.map((event, index) => (index === 3 ? { ...event, round: 99 } : event)),
    };
    database.db.update(evaluations).set({ trace: tampered }).where(eq(evaluations.id, id)).run();

    const replay = replayEvaluation(database.db, id);
    if (!replay.ok) throw new Error(replay.formErrors.join());
    expect(replay.data.comparison).toMatchObject({
      outcomeIdentical: true,
      traceIdentical: false,
      firstDivergentSeq: trace.events[3]?.seq,
    });
  });

  it('says which event differs and in which field (FR-16)', () => {
    const { id, trace } = run();
    const tampered = {
      ...trace,
      events: trace.events.map((event, index) => (index === 3 ? { ...event, round: 99 } : event)),
    };
    database.db.update(evaluations).set({ trace: tampered }).where(eq(evaluations.id, id)).run();

    const replay = replayEvaluation(database.db, id);
    if (!replay.ok) throw new Error(replay.formErrors.join());
    const changed = replay.data.comparison.diff?.trace.events.filter((e) => e.status !== 'same');
    expect(changed).toHaveLength(1);
    expect(changed?.[0]?.fields).toEqual(['round']);
    expect(replay.data.comparison.diff?.outcome.identical).toBe(true);
  });

  it('names an evaluation that does not exist', () => {
    const replay = replayEvaluation(database.db, 'nope');
    expect(!replay.ok && replay.formErrors.join()).toMatch(/no evaluation 'nope'/);
  });
});

describe('deleting a scenario that has stored runs (ADR-0030)', () => {
  it('is refused, and says how many runs reference it', () => {
    const [seeded] = database.db.select().from(scenarios).where(eq(scenarios.id, SCENARIO)).all();
    if (seeded === undefined) throw new Error('no scenario');
    database.db
      .insert(scenarios)
      .values({
        id: 'my-copy',
        name: 'My copy',
        situation: seeded.situation,
        templateId: null,
        params: null,
        origin: 'user',
        schemaVersion: SITUATION_SCHEMA_VERSION,
      })
      .run();
    for (const seed of ['a', 'b']) {
      const result = runEvaluation(database.db, {
        scenarioId: 'my-copy',
        profileId: PROFILE,
        seed,
      });
      expect(result.ok).toBe(true);
    }

    const deleted = deleteUserScenario(database.db, 'my-copy');
    expect(!deleted.ok && deleted.formErrors.join()).toMatch(/2 stored runs/);
    expect(
      database.db.select().from(scenarios).where(eq(scenarios.id, 'my-copy')).all(),
    ).toHaveLength(1);
  });
});
