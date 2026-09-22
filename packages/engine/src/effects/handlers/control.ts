/** `emitEvent` and `halt`: the two effects that say something about the run itself. */

import type { Effect } from '../../schema';
import type { EffectApplication, EffectContext } from '../context';
import { emptyApplication } from '../context';

export function emitEvent(
  effect: Extract<Effect, { type: 'emitEvent' }>,
  ctx: EffectContext,
): EffectApplication {
  const data = effect.data === undefined ? {} : { data: effect.data };
  return {
    ...emptyApplication(),
    events: [
      {
        stepId: ctx.step.id,
        round: ctx.step.round,
        phase: ctx.phase,
        kind: 'event',
        event: effect.event,
        ...data,
      },
    ],
    emitted: [{ stepId: ctx.step.id, event: effect.event, ...data }],
  };
}

export function halt(
  effect: Extract<Effect, { type: 'halt' }>,
  ctx: EffectContext,
): EffectApplication {
  // No trace event of its own: the halt is visible as `haltedEarlier` on every rule that
  // did not get to run, and on `StepOutcome.halted`.
  return { ...emptyApplication(), halt: { ruleKey: ctx.ruleKey, reason: effect.reason } };
}
