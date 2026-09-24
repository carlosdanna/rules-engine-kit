import 'server-only';

/**
 * One saved scenario under two profiles with one seed (FR-16, ADR-0031).
 *
 * Each side is evaluated exactly as `/playground` evaluates, from a profile rebuilt from rows
 * and refused when that rebuild no longer matches `profiles.resolved_hash` (ADR-0030). Nothing
 * is stored: a comparison is a question about two profiles, answered from its URL, and it
 * would make two `evaluations` rows nobody asked to keep.
 */

import { type Db, scenarios } from '@rules-engine-kit/db';
import {
  diffOutcomes,
  diffTraces,
  type Outcome,
  type OutcomeDiff,
  type Situation,
  type Trace,
  type TraceDiff,
} from '@rules-engine-kit/engine';
import { eq } from 'drizzle-orm';
import { evaluateFromRows, staleProfileMessage } from '../evaluations/run';
import type { ActionResult } from '../scenarios/types';

export type CompareInput = { scenarioId: string; a: string; b: string; seed: string };

export type CompareSide = { profileId: string; outcome: Outcome; trace: Trace };

export type CompareResult = {
  situation: Situation;
  a: CompareSide;
  b: CompareSide;
  outcomeDiff: OutcomeDiff;
  traceDiff: TraceDiff;
};

const fail = (message: string): ActionResult<never> => ({
  ok: false,
  formErrors: [message],
  fieldErrors: {},
});

function side(
  db: Db,
  label: 'A' | 'B',
  situation: Situation,
  profileId: string,
  seed: string,
): ActionResult<CompareSide> {
  const result = evaluateFromRows(db, situation, profileId, seed);
  if (!result.ok) return fail(`${label}: ${result.formErrors.join(' ')}`);
  if (!result.data.hashMatches) return fail(`${label}: ${staleProfileMessage(profileId)}`);
  return { ok: true, data: { profileId, outcome: result.data.outcome, trace: result.data.trace } };
}

export function compareRuns(db: Db, input: CompareInput): ActionResult<CompareResult> {
  const scenario = db.select().from(scenarios).where(eq(scenarios.id, input.scenarioId)).all()[0];
  if (scenario === undefined) return fail(`no scenario '${input.scenarioId}'`);

  const a = side(db, 'A', scenario.situation, input.a, input.seed);
  if (!a.ok) return a;
  const b = side(db, 'B', scenario.situation, input.b, input.seed);
  if (!b.ok) return b;

  return {
    ok: true,
    data: {
      situation: scenario.situation,
      a: a.data,
      b: b.data,
      outcomeDiff: diffOutcomes(a.data.outcome, b.data.outcome),
      traceDiff: diffTraces(a.data.trace, b.data.trace),
    },
  };
}
