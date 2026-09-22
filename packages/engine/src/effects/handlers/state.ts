/** `setValue` and `rollDice`: the two effects that write to the world state. */

import type { Effect } from '../../schema';
import type { EffectApplication, EffectContext } from '../context';
import { emptyApplication } from '../context';

export function setValue(
  effect: Extract<Effect, { type: 'setValue' }>,
  ctx: EffectContext,
): EffectApplication {
  return {
    ...emptyApplication(),
    deltas: [ctx.store.write(effect.path, effect.value, ctx.ruleKey)],
  };
}

export function rollDice(
  effect: Extract<Effect, { type: 'rollDice' }>,
  ctx: EffectContext,
): EffectApplication {
  // Its own channel, keyed by the destination, so forcing one `rollDice` cannot shift
  // another's values or the d20's (ADR-0011).
  const channel = `${ctx.step.id}/dice:${ctx.step.actorId}:${effect.into}`;
  const dice = Array.from(
    { length: effect.expr.count },
    () => ctx.roller.roll(channel, effect.expr.sides).value,
  );
  const total = dice.reduce((sum, die) => sum + die, 0);

  return {
    ...emptyApplication(),
    deltas: [ctx.store.write(effect.into, total, ctx.ruleKey)],
  };
}
