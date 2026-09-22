import { describe, expect, it } from 'vitest';
import { ActiveEffect, Duration, Effect, Expiry } from '../../src/index';

describe('Effect channels (ADR-0008, ADR-0011)', () => {
  it('accepts a numeric modifier with dice and a stacking policy', () => {
    const bless = Effect.parse({
      type: 'addModifier',
      target: { kind: 'attack', actor: '$target' },
      value: { count: 1, sides: 4 },
      modifierType: 'bless',
      stackKey: 'bless',
      policy: 'unique',
    });

    expect(bless.type).toBe('addModifier');
  });

  it('accepts a modifier aimed at a derived value rather than a roll (ADR-0006)', () => {
    const cover = Effect.safeParse({
      type: 'addModifier',
      target: { path: 'actor.ac.effective', actor: '$target' },
      value: 2,
      modifierType: 'cover',
      policy: 'highest',
    });

    expect(cover.success).toBe(true);
  });

  it('keeps roll mode and roll transform as separate channels from the numeric one', () => {
    const inspiration51 = Effect.parse({
      type: 'rollMode',
      target: { kind: 'attack', actor: '$actor' },
      mode: 'advantage',
    });
    const inspiration521 = Effect.parse({
      type: 'rollTransform',
      target: { kind: 'attack', actor: '$actor' },
      transform: { kind: 'reroll', keep: 'new' },
      uses: 1,
      dieSelector: { kind: 'intent' },
    });

    expect(inspiration51.type).toBe('rollMode');
    expect(inspiration521.type).toBe('rollTransform');
  });

  it('rejects `normal` as a granted roll mode: it is only ever a result', () => {
    const normal = {
      type: 'rollMode',
      target: { kind: 'attack', actor: '$actor' },
      mode: 'normal',
    };

    expect(Effect.safeParse(normal).success).toBe(false);
  });

  it('requires a die selector on a transform, since the choice is a player decision', () => {
    const noSelector = {
      type: 'rollTransform',
      target: { kind: 'attack', actor: '$actor' },
      transform: { kind: 'reroll', keep: 'new' },
      uses: 1,
    };

    expect(Effect.safeParse(noSelector).success).toBe(false);
  });

  it('accepts a fixed die selector for a rule that names the die itself', () => {
    const fixed = Effect.safeParse({
      type: 'rollTransform',
      target: { kind: 'attack', actor: '$actor' },
      transform: { kind: 'minimumDie', value: 10 },
      uses: 1,
      dieSelector: { kind: 'fixed', index: 0 },
    });

    expect(fixed.success).toBe(true);
  });

  it('rejects a transform with no uses, which could never fire', () => {
    const zeroUses = {
      type: 'rollTransform',
      target: { kind: 'attack', actor: '$actor' },
      transform: { kind: 'reroll', keep: 'higher' },
      uses: 0,
      dieSelector: { kind: 'intent' },
    };

    expect(Effect.safeParse(zeroUses).success).toBe(false);
  });

  it('accepts the rest of the catalogue (FR-7)', () => {
    const rest = [
      { type: 'setValue', path: 'actor.surprised', value: false },
      { type: 'rollDice', expr: { count: 2, sides: 6 }, into: 'damage.weapon' },
      {
        type: 'applyCondition',
        actor: '$target',
        condition: 'blessed',
        duration: { kind: 'rounds', rounds: 10, anchor: { kind: 'source' }, edge: 'end' },
      },
      { type: 'removeCondition', actor: '$target', condition: 'prone' },
      { type: 'emitEvent', event: 'attack.hit', data: { targetId: 'goblin' } },
      { type: 'halt', reason: 'surprised creatures cannot act on their first turn' },
    ];

    for (const effect of rest) {
      expect(Effect.safeParse(effect).success, effect.type).toBe(true);
    }
  });

  it('rejects an effect type outside the catalogue', () => {
    expect(Effect.safeParse({ type: 'patchState', path: 'a', value: 1 }).success).toBe(false);
  });
});

describe('addModifier is the only authored form of a modifier (ADR-0019)', () => {
  it('rejects an unknown stacking policy', () => {
    const unknown = {
      type: 'addModifier',
      target: { kind: 'attack', actor: '$actor' },
      value: 2,
      modifierType: 'cover',
      policy: 'average',
    };

    expect(Effect.safeParse(unknown).success).toBe(false);
  });

  it('has no separate `Modifier` schema to drift from it: the effect is the authored shape', async () => {
    const schema = await import('../../src/index');

    expect('Modifier' in schema).toBe(false);
  });
});

describe('Duration and Expiry (ADR-0012)', () => {
  it('accepts instant and permanent with no anchor', () => {
    expect(Duration.safeParse({ kind: 'instant' }).success).toBe(true);
    expect(Duration.safeParse({ kind: 'permanent' }).success).toBe(true);
  });

  it('accepts a 1-minute span as 10 rounds anchored to the source turn end', () => {
    const bless = Duration.parse({
      kind: 'rounds',
      rounds: 10,
      anchor: { kind: 'source' },
      edge: 'end',
    });

    expect(bless).toEqual({ kind: 'rounds', rounds: 10, anchor: { kind: 'source' }, edge: 'end' });
  });

  it('accepts "until the start of your next turn"', () => {
    const untilTurn = Duration.safeParse({
      kind: 'untilTurn',
      anchor: { kind: 'actor', actorId: 'fighter' },
      edge: 'start',
      afterRounds: 1,
    });

    expect(untilTurn.success).toBe(true);
  });

  it('rejects a time span with no anchor, which cannot resolve to a TimePoint', () => {
    expect(Duration.safeParse({ kind: 'rounds', rounds: 10 }).success).toBe(false);
    expect(
      Duration.safeParse({ kind: 'rounds', rounds: 10, anchor: { kind: 'source' } }).success,
    ).toBe(false);
  });

  it('distinguishes "outlives this run" from "permanent"', () => {
    expect(Expiry.parse({ kind: 'permanent' }).kind).toBe('permanent');
    expect(Expiry.parse({ kind: 'beyondTimeline', wouldExpireInRound: 11 }).kind).toBe(
      'beyondTimeline',
    );
    expect(
      Expiry.parse({ kind: 'at', point: { round: 11, stepIndex: 20, edge: 'end' } }).kind,
    ).toBe('at');
  });

  it('rejects the old two-way expiry that used null for both', () => {
    expect(Expiry.safeParse(null).success).toBe(false);
  });
});

describe('ActiveEffect', () => {
  it('records where it came from, who carries it and when it ends', () => {
    const blessed = ActiveEffect.parse({
      id: 'eff-1',
      sourceRuleKey: 'spell.bless.cast',
      actorId: 'fighter',
      condition: 'blessed',
      duration: { kind: 'rounds', rounds: 10, anchor: { kind: 'source' }, edge: 'end' },
      appliedAt: { round: 1, stepIndex: 0, edge: 'end' },
      expiresAt: { kind: 'at', point: { round: 11, stepIndex: 20, edge: 'end' } },
    });

    expect(blessed.expiresAt.kind).toBe('at');
  });

  it('requires a resolved expiry, not a raw duration', () => {
    const unresolved = {
      id: 'eff-1',
      sourceRuleKey: 'spell.bless.cast',
      actorId: 'fighter',
      condition: 'blessed',
      duration: { kind: 'permanent' },
      appliedAt: { round: 1, stepIndex: 0, edge: 'end' },
    };

    expect(ActiveEffect.safeParse(unresolved).success).toBe(false);
  });
});
