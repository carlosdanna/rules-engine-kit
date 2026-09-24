import 'server-only';

/**
 * Running a scenario, storing the run, and replaying a stored one (VR-7, ADR-0030).
 *
 * Every function takes `db` first, as `lib/scenarios/write.ts` does, so `run.test.ts` drives
 * them against an in-memory database and never touches `data/app.db`.
 *
 * **The profile comes from the database.** `loadResolvedProfile` rebuilds it from the seeded
 * rows, and a run is refused when that rebuild no longer matches `profiles.resolved_hash`: the
 * hash is what the row records, and a run stored under a hash its rows do not produce would be
 * evidence of nothing.
 *
 * **A replay is not stored.** It answers "does the current engine reproduce this run?", and
 * the answer is a comparison, not a second row. It re-runs the *stored* situation, so an edit
 * to the scenario since cannot masquerade as an engine change.
 */

import {
  type Db,
  evaluations,
  loadResolvedProfile,
  StaleProfileError,
  scenarios,
} from '@rules-engine-kit/db';
import {
  canonicalJson,
  ENGINE_VERSION,
  evaluate,
  type Outcome,
  type Situation,
  type Trace,
} from '@rules-engine-kit/engine';
import { eq } from 'drizzle-orm';
import type { ActionResult } from '../scenarios/types';

const fail = (message: string): ActionResult<never> => ({
  ok: false,
  formErrors: [message],
  fieldErrors: {},
});

export type RunInput = { scenarioId: string; profileId: string; seed: string };

export type RunResult = RunInput & {
  id: string;
  outcome: Outcome;
  trace: Trace;
  situation: Situation;
};

/** Evaluate with a profile rebuilt from rows; any engine or staleness error comes back as data. */
function evaluateFromRows(
  db: Db,
  situation: Situation,
  profileId: string,
  seed: string,
): ActionResult<{ outcome: Outcome; trace: Trace; hashMatches: boolean }> {
  try {
    const { profile, facts, storedHash } = loadResolvedProfile(db, profileId);
    const { outcome, trace } = evaluate(situation, profile, { seed, facts });
    return { ok: true, data: { outcome, trace, hashMatches: profile.hash === storedHash } };
  } catch (thrown) {
    return fail((thrown as Error).message);
  }
}

export function runEvaluation(db: Db, input: RunInput): ActionResult<RunResult> {
  const scenario = db.select().from(scenarios).where(eq(scenarios.id, input.scenarioId)).all()[0];
  if (scenario === undefined) return fail(`no scenario '${input.scenarioId}'`);

  const result = evaluateFromRows(db, scenario.situation, input.profileId, input.seed);
  if (!result.ok) return result;
  if (!result.data.hashMatches) {
    return fail(
      new StaleProfileError(`profile '${input.profileId}' no longer resolves to its stored hash`)
        .message,
    );
  }

  const { outcome, trace } = result.data;
  const id = crypto.randomUUID();
  db.insert(evaluations)
    .values({
      id,
      scenarioId: scenario.id,
      profileId: input.profileId,
      profileHash: outcome.profileHash,
      seed: outcome.seed,
      engineVersion: outcome.engineVersion,
      traceSchemaVersion: outcome.traceSchemaVersion,
      situation: scenario.situation,
      outcome,
      trace,
    })
    .run();

  return { ok: true, data: { ...input, id, outcome, trace, situation: scenario.situation } };
}

export type ReplayComparison = {
  outcomeIdentical: boolean;
  traceIdentical: boolean;
  /** `seq` of the first event that differs, or where one trace ends early; `null` if none. */
  firstDivergentSeq: number | null;
};

export type ReplayResult = {
  outcome: Outcome;
  trace: Trace;
  comparison: ReplayComparison;
  /** The stored run's engine is not this one, so a difference may be the engine's. */
  engineVersionChanged: boolean;
  /** The profile's rows resolve to a different hash than the run recorded. */
  profileHashChanged: boolean;
};

/**
 * Canonical JSON, not a field-by-field walk: the columns round-trip through SQLite's text, so
 * key order is the one thing that may legitimately differ between two equal documents.
 * `diffOutcomes`/`diffTraces` (FR-16) would say *what* differs; they are not built yet.
 */
function compare(
  stored: { outcome: Outcome; trace: Trace },
  fresh: { outcome: Outcome; trace: Trace },
): ReplayComparison {
  const outcomeIdentical = canonicalJson(stored.outcome) === canonicalJson(fresh.outcome);
  const traceIdentical = canonicalJson(stored.trace) === canonicalJson(fresh.trace);

  let firstDivergentSeq: number | null = null;
  if (!traceIdentical) {
    const length = Math.max(stored.trace.events.length, fresh.trace.events.length);
    for (let index = 0; index < length; index++) {
      const a = stored.trace.events[index];
      const b = fresh.trace.events[index];
      if (a === undefined || b === undefined || canonicalJson(a) !== canonicalJson(b)) {
        firstDivergentSeq = (a ?? b)?.seq ?? index;
        break;
      }
    }
  }

  return { outcomeIdentical, traceIdentical, firstDivergentSeq };
}

export function replayEvaluation(db: Db, id: string): ActionResult<ReplayResult> {
  const stored = db.select().from(evaluations).where(eq(evaluations.id, id)).all()[0];
  if (stored === undefined) return fail(`no evaluation '${id}'`);

  const result = evaluateFromRows(db, stored.situation, stored.profileId, stored.seed);
  if (!result.ok) return result;

  const { outcome, trace } = result.data;
  return {
    ok: true,
    data: {
      outcome,
      trace,
      comparison: compare(stored, { outcome, trace }),
      engineVersionChanged: stored.engineVersion !== ENGINE_VERSION,
      profileHashChanged: stored.profileHash !== outcome.profileHash,
    },
  };
}
