/**
 * VR-7: a stored evaluation carries the profile hash, the seed, the engine version and the
 * trace schema version — the four things that make a stored run replayable rather than merely
 * recorded.
 *
 * The run is a real one: a seeded scenario, evaluated against the profile it was seeded under,
 * and written back. That is the loop M4's `/evaluations/[id]` walks, and doing it here means
 * the JSON columns are typed against an outcome and a trace the engine actually produced
 * rather than against a hand-written stub.
 */

import {
  ENGINE_VERSION,
  evaluate,
  resolveProfile,
  TRACE_SCHEMA_VERSION,
} from '@rules-engine-kit/engine';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { evaluations, scenarios } from '../../src/schema/scenarios';
import { seedDatabase } from '../../src/seed';
import { openTestDb, seedContent } from './helpers';

const SCENARIO = 'melee-attack';
const PROFILE = 'srd-5.1';
const SEED = 'demo';

function runIt() {
  const content = seedContent();
  const profileManifest = content.profiles.find((profile) => profile.slug === PROFILE);
  if (profileManifest === undefined) throw new Error(`no profile ${PROFILE}`);

  const stack = profileManifest.layers.map((layer) => {
    const pack = content.packs.find(
      (candidate) => candidate.id === layer.id && candidate.version === layer.version,
    );
    if (pack === undefined) throw new Error(`no pack ${layer.id}@${layer.version}`);
    return pack;
  });

  const scenario = content.scenarios.find((candidate) => candidate.slug === SCENARIO);
  if (scenario === undefined) throw new Error(`no scenario ${SCENARIO}`);

  const profile = resolveProfile(stack);
  const facts = stack.flatMap((pack) => pack.facts);
  return { profile, ...evaluate(scenario.situation, profile, { seed: SEED, facts }) };
}

describe('a stored evaluation (VR-7)', () => {
  it('round-trips all four fields and both JSON documents', () => {
    const database = openTestDb();
    try {
      seedDatabase(database.db, seedContent());
      const { profile, outcome, trace } = runIt();

      database.db
        .insert(evaluations)
        .values({
          id: 'evaluation-1',
          scenarioId: SCENARIO,
          profileId: PROFILE,
          profileHash: profile.hash,
          seed: SEED,
          engineVersion: ENGINE_VERSION,
          traceSchemaVersion: TRACE_SCHEMA_VERSION,
          outcome,
          trace,
        })
        .run();

      const [stored] = database.db
        .select()
        .from(evaluations)
        .where(eq(evaluations.id, 'evaluation-1'))
        .all();

      expect(stored).toMatchObject({
        profileHash: profile.hash,
        seed: SEED,
        engineVersion: ENGINE_VERSION,
        traceSchemaVersion: TRACE_SCHEMA_VERSION,
      });
      // Objects, not strings: the `mode: 'json'` columns are what make a viewer possible.
      expect(stored?.outcome).toEqual(outcome);
      expect(stored?.trace).toEqual(trace);
      expect(stored?.trace.events.length).toBeGreaterThan(0);
    } finally {
      database.close();
    }
  });

  it('replays to the same outcome from the stored situation, seed and profile (NFR-1)', () => {
    const database = openTestDb();
    try {
      seedDatabase(database.db, seedContent());
      const first = runIt();

      const [stored] = database.db.select().from(scenarios).where(eq(scenarios.id, SCENARIO)).all();
      expect(stored?.situation).toEqual(
        seedContent().scenarios.find((scenario) => scenario.slug === SCENARIO)?.situation,
      );

      expect(runIt().outcome).toEqual(first.outcome);
    } finally {
      database.close();
    }
  });
});
