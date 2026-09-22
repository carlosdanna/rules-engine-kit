import { describe, expect, it } from 'vitest';
import { makeRollId, REROLL_CHANNEL, withChannel } from '../../src/dice';

describe('makeRollId', () => {
  it('builds the id schema/primitives.ts defines', () => {
    expect(makeRollId('r3-fighter', { kind: 'attack', actorId: 'fighter' })).toBe(
      'r3-fighter/attack:fighter',
    );
  });

  it('suffixes a channel for dice that are not the d20 itself', () => {
    const base = makeRollId('r3-fighter', { kind: 'attack', actorId: 'fighter' });
    expect(withChannel(base, REROLL_CHANNEL)).toBe('r3-fighter/attack:fighter:reroll');
    expect(makeRollId('r3-fighter', { kind: 'attack', actorId: 'fighter' }, 'bless')).toBe(
      'r3-fighter/attack:fighter:bless',
    );
  });

  it('is derivable from the situation alone, so a template can pre-declare a choice', () => {
    // ADR-0011: the same id keys the trace, forcedRolls and intents.rollChoices, and the
    // template's `$rollId(attack)` expands to exactly this.
    expect(makeRollId('r1-fighter', { kind: 'initiative', actorId: 'goblin' })).toBe(
      'r1-fighter/initiative:goblin',
    );
  });

  it('rejects tokens that would make the id ambiguous', () => {
    expect(() => makeRollId('', { kind: 'attack', actorId: 'fighter' })).toThrow();
    expect(() => makeRollId('r3/fighter', { kind: 'attack', actorId: 'fighter' })).toThrow();
    expect(() => makeRollId('r3-fighter', { kind: 'attack', actorId: 'fig:hter' })).toThrow();
  });
});
