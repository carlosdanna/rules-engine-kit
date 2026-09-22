import { describe, expect, it } from 'vitest';
import {
  DiceNotationError,
  formatDiceNotation,
  fromDiceExpr,
  parseDiceNotation,
} from '../../src/dice';

describe('parseDiceNotation', () => {
  it('parses NdX', () => {
    expect(parseDiceNotation('1d20')).toEqual({ count: 1, sides: 20, modifier: 0 });
    expect(parseDiceNotation('2d6')).toEqual({ count: 2, sides: 6, modifier: 0 });
  });

  it('parses NdX+M and NdX-M', () => {
    expect(parseDiceNotation('2d6+3')).toEqual({ count: 2, sides: 6, modifier: 3 });
    expect(parseDiceNotation('1d8-1')).toEqual({ count: 1, sides: 8, modifier: -1 });
  });

  it('tolerates surrounding whitespace and an upper-case D', () => {
    expect(parseDiceNotation('  4D8 + 2 ')).toEqual({ count: 4, sides: 8, modifier: 2 });
  });

  it.each([
    ['d20'],
    ['2d'],
    ['0d6'],
    ['2d0'],
    ['2d6+'],
    ['2d6+x'],
    ['2d6+3+1'],
    [''],
    ['longsword'],
  ])('rejects %j rather than defaulting', (input) => {
    expect(() => parseDiceNotation(input)).toThrow(DiceNotationError);
  });
});

describe('formatDiceNotation', () => {
  it('round-trips through parse', () => {
    for (const input of ['1d20', '2d6+3', '1d8-1', '10d4']) {
      expect(formatDiceNotation(parseDiceNotation(input))).toBe(input);
    }
  });

  it('renders a structured DiceExpr, which is what the trace shows', () => {
    // Feeds `AppliedModifier.rolled.expr`, so "+3 bless" can show the d4 behind it.
    expect(formatDiceNotation({ count: 1, sides: 4 })).toBe('1d4');
    expect(formatDiceNotation(fromDiceExpr({ count: 2, sides: 6 }))).toBe('2d6');
  });

  it('drops a zero modifier rather than printing +0', () => {
    expect(formatDiceNotation({ count: 1, sides: 4, modifier: 0 })).toBe('1d4');
  });
});

describe('fromDiceExpr', () => {
  it('carries no modifier, because authored bonuses go through the stacking channel', () => {
    // `DiceExpr` is deliberately `{count, sides}` (schema/primitives.ts): a +M baked into
    // a rule's dice value would be invisible to the stacking policies (FR-11).
    expect(fromDiceExpr({ count: 1, sides: 4 })).toEqual({ count: 1, sides: 4, modifier: 0 });
  });
});
