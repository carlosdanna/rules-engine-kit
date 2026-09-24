'use client';

/**
 * Replay a stored run on the current engine and say whether it reproduced (ADR-0030).
 *
 * Nothing is stored, and the result says so. A replay re-runs the *stored* situation with
 * the stored seed, so a difference is the engine's or the profile's — and the two flags
 * say which of those changed, before anyone reads the diff as a bug.
 */

import { ENGINE_VERSION } from '@rules-engine-kit/engine';
import { useActionState, useTransition } from 'react';
import { replayEvaluationAction } from '@/app/evaluations/[id]/actions';
import { Button } from '@/components/ui/button';
import type { ReplayResult } from '@/lib/evaluations/run';
import type { ActionResult } from '@/lib/scenarios/types';

export function ReplayPanel({ id, recordedEngine }: { id: string; recordedEngine: string }) {
  const [pending, startTransition] = useTransition();
  const [result, replay] = useActionState<ActionResult<ReplayResult> | null, { id: string }>(
    replayEvaluationAction,
    null,
  );

  const data = result?.ok === true ? result.data : null;
  const identical = data?.comparison.outcomeIdentical === true && data.comparison.traceIdentical;

  return (
    <div className="space-y-2" data-testid="replay-panel">
      <Button onClick={() => startTransition(() => replay({ id }))} disabled={pending}>
        {pending ? 'Replaying…' : `Replay on engine v${ENGINE_VERSION}`}
      </Button>

      {result !== null && !result.ok && (
        <p className="text-sm text-destructive">{result.formErrors.join(' ')}</p>
      )}

      {data !== null && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${identical ? '' : 'border-amber-500/60 bg-amber-500/10'}`}
          role="status"
        >
          <p className="font-medium">
            {identical
              ? 'Identical to the stored run.'
              : data.comparison.outcomeIdentical
                ? 'Same outcome, different trace.'
                : 'The outcome differs from the stored run.'}
          </p>
          {data.comparison.firstDivergentSeq !== null && (
            <p>First differing trace event: seq {data.comparison.firstDivergentSeq}.</p>
          )}
          {data.engineVersionChanged && (
            <p>
              Recorded with engine v{recordedEngine}; replayed with v{ENGINE_VERSION}.
            </p>
          )}
          {data.profileHashChanged && (
            <p>The profile now resolves to {data.outcome.profileHash}, not the hash recorded.</p>
          )}
          <p className="text-xs text-muted-foreground">
            Replayed on the current engine, v{ENGINE_VERSION}. Not saved.
          </p>
        </div>
      )}
    </div>
  );
}
