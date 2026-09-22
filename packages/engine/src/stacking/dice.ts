/**
 * Rolling a dice-valued modifier (`value: { count, sides }`) into the number that stacking
 * and the trace both work in.
 *
 * Called when the `addModifier` effect is applied — during the `modifiers` phase — rather
 * than at stacking time. That keeps `resolveStack` pure, and it makes the dice of a dropped
 * modifier still observable, which matters because whether a modifier was dropped is a
 * conclusion the trace has to be able to show its working for (FR-14).
 */

import { formatDiceNotation, fromDiceExpr, type Roller } from '../dice';
import type { DiceExpr, RollId } from '../schema';

export type RolledModifierValue = {
  value: number;
  rolled?: { expr: string; dice: number[] };
};

/**
 * `channel` is the modifier's own roll-id channel — `withChannel(targetRollId, modifierType)`
 * — so forcing Bless's d4 cannot disturb the d20 beside it (ADR-0011). Two dice-valued
 * modifiers of the same type on one target therefore share a channel and consume its forced
 * values in order, at indices 0 and 1.
 */
export function rollModifierValue(args: {
  /**
   * Already resolved: a `{ fact: … }` value is read in the effects layer before it reaches
   * here (ADR-0021), so this module stays free of the fact source and of the errors reading
   * one can raise.
   */
  value: number | DiceExpr;
  roller: Roller;
  channel: RollId;
}): RolledModifierValue {
  const { value, roller, channel } = args;

  if (typeof value === 'number') {
    return { value };
  }

  const dice = Array.from({ length: value.count }, () => roller.roll(channel, value.sides).value);

  return {
    value: dice.reduce((sum, die) => sum + die, 0),
    rolled: { expr: formatDiceNotation(fromDiceExpr(value)), dice },
  };
}
