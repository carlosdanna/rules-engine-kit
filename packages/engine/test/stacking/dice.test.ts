import { describe, expect, it } from 'vitest';
import { createRoller, withChannel } from '../../src/dice';
import { resolveStack, rollModifierValue } from '../../src/stacking';

const channel = withChannel('r1-cleric/attack:fighter', 'bless');

describe('rollModifierValue — dice-valued modifiers (ADR-0014)', () => {
  it('passes a flat number through with no rolled record', () => {
    const roller = createRoller({ seed: 'demo-seed' });
    expect(rollModifierValue({ value: 3, roller, channel })).toEqual({ value: 3 });
    expect(roller.log).toEqual([]);
  });

  it('rolls 1d4 forced to 3 and records the die behind the +3 (FR-13)', () => {
    const roller = createRoller({ seed: 'demo-seed', forcedRolls: { [channel]: [3] } });
    expect(rollModifierValue({ value: { count: 1, sides: 4 }, roller, channel })).toEqual({
      value: 3,
      rolled: { expr: '1d4', dice: [3] },
    });
  });

  it('sums a multi-die expression and keeps every die', () => {
    const roller = createRoller({ seed: 'demo-seed', forcedRolls: { [channel]: [2, 5] } });
    expect(rollModifierValue({ value: { count: 2, sides: 6 }, roller, channel })).toEqual({
      value: 7,
      rolled: { expr: '2d6', dice: [2, 5] },
    });
  });

  it('rolls on its own channel, so forcing a modifier cannot disturb the d20', () => {
    const roller = createRoller({ seed: 'demo-seed', forcedRolls: { [channel]: [3] } });
    rollModifierValue({ value: { count: 1, sides: 4 }, roller, channel });
    expect(roller.log.map((record) => record.rollId)).toEqual([channel]);
  });

  it('keeps the dice of a modifier that stacking later drops', () => {
    const roller = createRoller({ seed: 'demo-seed', forcedRolls: { [channel]: [3, 4] } });
    const first = rollModifierValue({ value: { count: 1, sides: 4 }, roller, channel });
    const second = rollModifierValue({ value: { count: 1, sides: 4 }, roller, channel });
    const { dropped } = resolveStack([
      {
        ruleKey: 'spell.bless',
        modifierType: 'bless',
        stackKey: 'bless',
        policy: 'unique',
        ...first,
      },
      {
        ruleKey: 'spell.bless.2',
        modifierType: 'bless',
        stackKey: 'bless',
        policy: 'unique',
        ...second,
      },
    ]);
    expect(dropped[0]?.modifier.rolled).toEqual({ expr: '1d4', dice: [4] });
  });
});
