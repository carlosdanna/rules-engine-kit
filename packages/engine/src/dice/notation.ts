import type { DiceExpr } from '../schema';

/**
 * `NdX+M` as a string, for the places a string is the right currency: what an author
 * types, and what the trace renders back out as `AppliedModifier.rolled.expr` so "+3
 * bless" can show the d4 that produced it.
 *
 * Authored *content* stays on the structured `DiceExpr` (`schema/primitives.ts`): a flat
 * bonus baked into a dice string would bypass the `addModifier` channel and its stacking
 * policies (FR-11, ADR-0011), so `modifier` here is carried separately and stays visible.
 */
export type DiceNotation = {
  count: number;
  sides: number;
  /** `0` when the notation carried no `+M` / `-M`. */
  modifier: number;
};

const PATTERN = /^(\d+)\s*[dD]\s*(\d+)\s*(?:([+-])\s*(\d+))?$/;

export class DiceNotationError extends Error {
  readonly code = 'DICE_NOTATION';
  readonly input: string;

  constructor(input: string, detail: string) {
    super(`'${input}' is not dice notation: ${detail}`);
    this.name = 'DiceNotationError';
    this.input = input;
  }
}

export function parseDiceNotation(input: string): DiceNotation {
  const match = PATTERN.exec(input.trim());
  if (match === null) {
    throw new DiceNotationError(input, 'expected NdX, NdX+M or NdX-M');
  }

  const [, rawCount, rawSides, sign, rawModifier] = match;
  const count = Number(rawCount);
  const sides = Number(rawSides);
  if (count < 1) throw new DiceNotationError(input, 'needs at least one die');
  if (sides < 1) throw new DiceNotationError(input, 'a die needs at least one side');

  const magnitude = rawModifier === undefined ? 0 : Number(rawModifier);
  return { count, sides, modifier: sign === '-' ? -magnitude : magnitude };
}

export function formatDiceNotation(notation: DiceExpr | DiceNotation): string {
  const modifier = 'modifier' in notation ? notation.modifier : 0;
  const base = `${notation.count}d${notation.sides}`;
  if (modifier === 0) return base;
  return `${base}${modifier > 0 ? '+' : '-'}${Math.abs(modifier)}`;
}

/** Structured authored content reusing the same formatter, so one spelling reaches the trace. */
export function fromDiceExpr(expr: DiceExpr): DiceNotation {
  return { count: expr.count, sides: expr.sides, modifier: 0 };
}
