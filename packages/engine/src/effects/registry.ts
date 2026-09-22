/**
 * The effect registry (FR-7): one handler per effect type, dispatched on the `type`
 * discriminant.
 *
 * `EFFECT_HANDLERS` is a mapped type over `EffectType`, so adding a member to the schema's
 * `Effect` union and forgetting its handler is a *compile* error rather than a run-time
 * surprise. That is the whole reason the table is a record and not a switch.
 */

import type { Effect, EffectType } from '../schema';
import type { EffectApplication, EffectContext } from './context';
import { emptyApplication } from './context';
import { applyCondition, removeCondition } from './handlers/conditions';
import { emitEvent, halt } from './handlers/control';
import { addModifier, rollMode, rollTransform, scaleDamage } from './handlers/roll';
import { rollDice, setValue } from './handlers/state';

export type EffectHandler<T extends Effect = Effect> = (
  effect: T,
  ctx: EffectContext,
) => EffectApplication;

export const EFFECT_HANDLERS: {
  [K in EffectType]: EffectHandler<Extract<Effect, { type: K }>>;
} = {
  setValue,
  addModifier,
  rollMode,
  rollTransform,
  scaleDamage,
  rollDice,
  applyCondition,
  removeCondition,
  emitEvent,
  halt,
};

export function applyEffect(effect: Effect, ctx: EffectContext): EffectApplication {
  // The cast is the standard price of dispatching a discriminated union through a lookup
  // table; the table's type guarantees each handler matches its own key.
  const handler = EFFECT_HANDLERS[effect.type] as EffectHandler;
  return handler(effect, ctx);
}

/** Applies a rule's effects in order, stopping at the first `halt` — halt means halt. */
export function applyEffects(effects: readonly Effect[], ctx: EffectContext): EffectApplication {
  const combined = emptyApplication();

  for (const effect of effects) {
    const application = applyEffect(effect, ctx);
    combined.deltas.push(...application.deltas);
    combined.events.push(...application.events);
    combined.emitted.push(...application.emitted);
    if (application.halt !== undefined) {
      combined.halt = application.halt;
      break;
    }
  }

  return combined;
}
