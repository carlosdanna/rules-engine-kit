'use server';

/**
 * Running a scenario from `/playground` (VR-7, ADR-0030).
 *
 * Thin, like `app/scenarios/actions.ts`: the rules live in `lib/evaluations/run.ts`, which
 * takes its database as an argument and is tested against an in-memory one. An action is a
 * public POST endpoint, so the payload is checked here rather than trusted — it is three
 * strings, and `zod` does not resolve from `apps/web` (ADR-0029).
 */

import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/db';
import { type RunResult, runEvaluation } from '@/lib/evaluations/run';
import type { ActionResult } from '@/lib/scenarios/types';

export type RunPayload = { scenarioId: string; profileId: string; seed: string };

const nonEmpty = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '';

export async function runEvaluationAction(
  _previous: unknown,
  payload: RunPayload,
): Promise<ActionResult<RunResult>> {
  const { scenarioId, profileId, seed } = (payload ?? {}) as Partial<RunPayload>;
  const fieldErrors: Record<string, string> = {};
  if (!nonEmpty(scenarioId)) fieldErrors.scenarioId = 'choose a scenario';
  if (!nonEmpty(profileId)) fieldErrors.profileId = 'choose a profile';
  if (!nonEmpty(seed)) fieldErrors.seed = 'a seed is required';
  if (!nonEmpty(scenarioId) || !nonEmpty(profileId) || !nonEmpty(seed)) {
    return { ok: false, formErrors: [], fieldErrors };
  }

  const result = runEvaluation(getDb(), { scenarioId, profileId, seed: seed.trim() });
  if (result.ok) revalidatePath(`/evaluations/${result.data.id}`);
  return result;
}
