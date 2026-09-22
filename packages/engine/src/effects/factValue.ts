/**
 * Resolving an effect's value when the rule named a fact instead of a number (ADR-0021).
 *
 * Content states the rule and the registry states the number: `attack.ability-modifier`
 * adds `actor.abilityMod.str`, and a weapon deals `action.weapon.damage.dice`, so one rule
 * body is right for every fixture (FR-8). Reading happens here, in the effects layer,
 * rather than in `src/stacking/`: stacking stays pure and roller-free, and a failure can
 * name the rule and the effect that caused it.
 *
 * The fact source is the same one conditions read, so a derived path throws
 * `derived-not-sealed` exactly as it would inside a condition — an effect contributing to a
 * total during `modifiers` must not read the total that phase is still assembling.
 */

import { DiceNotationError, parseDiceNotation } from '../dice';
import type { DiceExpr, EffectType, Json, ModifierValue } from '../schema';
import type { EffectContext } from './context';
import { EffectApplicationError } from './errors';

/** The authored value, with the fact path kept when one was read, for the trace (FR-14). */
export type ResolvedEffectValue = {
  value: number | DiceExpr;
  /** Set only when the value came from a fact. */
  fromFact?: string;
};

function show(value: Json): string {
  return JSON.stringify(value) ?? String(value);
}

/**
 * Dice notation (`1d8`) and a plain number are the two shapes a fact may carry into a
 * value. Notation with a `+M` is rejected for the reason `content-authoring.md` gives for
 * authored dice, which does not stop being true because the string arrived from a fixture.
 */
function fromFactValue(
  read: Json,
  path: string,
  ruleKey: string,
  effectType: EffectType,
): number | DiceExpr {
  const fail = (kind: 'fact-value-unusable' | 'fact-value-flat-bonus') => {
    throw new EffectApplicationError({ kind, path, value: show(read) }, ruleKey, effectType);
  };

  if (typeof read === 'number') {
    if (!Number.isInteger(read)) fail('fact-value-unusable');
    return read;
  }

  if (typeof read !== 'string') return fail('fact-value-unusable');

  let notation: ReturnType<typeof parseDiceNotation>;
  try {
    notation = parseDiceNotation(read);
  } catch (error) {
    if (error instanceof DiceNotationError) return fail('fact-value-unusable');
    throw error;
  }

  if (notation.modifier !== 0) fail('fact-value-flat-bonus');
  return { count: notation.count, sides: notation.sides };
}

export function resolveEffectValue(
  value: ModifierValue,
  ctx: EffectContext,
  effectType: EffectType,
): ResolvedEffectValue {
  if (typeof value === 'number' || 'count' in value) return { value };

  return {
    value: fromFactValue(ctx.readFact(value.fact), value.fact, ctx.ruleKey, effectType),
    fromFact: value.fact,
  };
}

/** `rollDice` needs dice: a fact that reads as a number is a total, not a pool to roll. */
export function resolveDiceValue(
  value: ModifierValue,
  ctx: EffectContext,
  effectType: EffectType,
): { expr: DiceExpr; fromFact?: string } {
  const resolved = resolveEffectValue(value, ctx, effectType);

  if (typeof resolved.value === 'number') {
    throw new EffectApplicationError(
      {
        kind: 'fact-value-not-dice',
        path: resolved.fromFact ?? '(literal)',
        value: String(resolved.value),
      },
      ctx.ruleKey,
      effectType,
    );
  }

  return {
    expr: resolved.value,
    ...(resolved.fromFact === undefined ? {} : { fromFact: resolved.fromFact }),
  };
}
