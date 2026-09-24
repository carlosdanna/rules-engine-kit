'use server';

/**
 * Replaying a stored run on the current engine (ADR-0030). Nothing is written: a replay
 * answers "does this engine reproduce that run?", and the answer is a comparison.
 */

import { getDb } from '@/lib/db';
import { type ReplayResult, replayEvaluation } from '@/lib/evaluations/run';
import type { ActionResult } from '@/lib/scenarios/types';

export async function replayEvaluationAction(
  _previous: unknown,
  payload: { id: string },
): Promise<ActionResult<ReplayResult>> {
  const id = (payload as Partial<{ id: string }> | null)?.id;
  if (typeof id !== 'string' || id === '') {
    return { ok: false, formErrors: ['no evaluation id'], fieldErrors: {} };
  }
  return replayEvaluation(getDb(), id);
}
