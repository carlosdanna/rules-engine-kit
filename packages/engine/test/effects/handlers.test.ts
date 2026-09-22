import { describe, expect, it } from 'vitest';
import { createRoller } from '../../src/dice';
import { applyEffect } from '../../src/effects';
import { actor, attackStep, castStep, fakeContext } from './fakeContext';

describe('setValue — writes state and reports the delta (FR-14)', () => {
  it('replaces the value and names what it was', () => {
    const ctx = fakeContext();
    const { deltas } = applyEffect(
      { type: 'setValue', path: 'actor.fighter.hpCurrent', value: 18 },
      ctx,
    );
    expect(deltas).toEqual([{ path: 'actor.fighter.hpCurrent', from: 30, to: 18 }]);
    expect(ctx.store.actor('fighter').hpCurrent).toBe(18);
  });
});

describe('rollDice — rolls into a path on its own channel (ADR-0011)', () => {
  it('writes the total and keeps the dice off the d20 channel', () => {
    const channel = 'r1-fighter/dice:fighter:scratch.damage.total';
    const roller = createRoller({ seed: 'demo-seed', forcedRolls: { [channel]: [3, 4] } });
    const ctx = fakeContext({ roller });
    const { deltas } = applyEffect(
      { type: 'rollDice', expr: { count: 2, sides: 6 }, into: 'scratch.damage.total' },
      ctx,
    );
    expect(deltas[0]?.to).toBe(7);
    expect(roller.log.map((r) => r.rollId)).toEqual([channel, channel]);
  });
});

describe('addModifier — the numeric channel (FR-11)', () => {
  it('lands on the resolved roll id with its policy and stack key', () => {
    const ctx = fakeContext();
    applyEffect(
      {
        type: 'addModifier',
        target: { kind: 'attack', actor: '$actor' },
        value: 3,
        modifierType: 'ability',
        policy: 'sum',
      },
      ctx,
    );
    expect(ctx.bus.rollModifiersFor('r1-fighter/attack:fighter')).toEqual([
      { ruleKey: 'test.rule', modifierType: 'ability', policy: 'sum', value: 3 },
    ]);
  });

  it('rolls a dice-valued modifier on its own modifier-type channel', () => {
    const channel = 'r1-fighter/attack:fighter:bless';
    const roller = createRoller({ seed: 'demo-seed', forcedRolls: { [channel]: [3] } });
    const ctx = fakeContext({ roller });
    applyEffect(
      {
        type: 'addModifier',
        target: { kind: 'attack', actor: '$actor' },
        value: { count: 1, sides: 4 },
        modifierType: 'bless',
        stackKey: 'bless',
        policy: 'unique',
      },
      ctx,
    );
    expect(ctx.bus.rollModifiersFor('r1-fighter/attack:fighter')[0]).toMatchObject({
      value: 3,
      stackKey: 'bless',
      rolled: { expr: '1d4', dice: [3] },
    });
  });

  it('routes a derived target to the derived lane, not a roll lane', () => {
    const ctx = fakeContext();
    applyEffect(
      {
        type: 'addModifier',
        target: { path: 'actor.ac.effective', actor: '$target' },
        value: 2,
        modifierType: 'cover',
        policy: 'highest',
      },
      ctx,
    );
    expect(ctx.bus.derivedGroups()).toEqual([
      {
        path: 'actor.ac.effective',
        actorId: 'goblin',
        modifiers: [{ ruleKey: 'test.rule', modifierType: 'cover', policy: 'highest', value: 2 }],
      },
    ]);
  });
});

describe('rollMode and rollTransform — the other two channels (ADR-0011)', () => {
  it('records a mode grant with the rule that granted it, without cancelling yet', () => {
    const ctx = fakeContext();
    applyEffect(
      { type: 'rollMode', target: { kind: 'attack', actor: '$actor' }, mode: 'advantage' },
      ctx,
    );
    applyEffect(
      { type: 'rollMode', target: { kind: 'attack', actor: '$actor' }, mode: 'disadvantage' },
      ctx,
    );
    // Both survive: cancelling is a set operation over the whole phase's grants.
    expect(ctx.bus.modeInputsFor('r1-fighter/attack:fighter')).toEqual([
      { ruleKey: 'test.rule', mode: 'advantage' },
      { ruleKey: 'test.rule', mode: 'disadvantage' },
    ]);
  });

  it('keeps uses and the die selector unexpanded until the pool exists', () => {
    const ctx = fakeContext();
    applyEffect(
      {
        type: 'rollTransform',
        target: { kind: 'attack', actor: '$actor' },
        transform: { kind: 'reroll', keep: 'new' },
        uses: 1,
        dieSelector: { kind: 'intent' },
      },
      ctx,
    );
    expect(ctx.bus.transformRequestsFor('r1-fighter/attack:fighter')).toEqual([
      {
        ruleKey: 'test.rule',
        rollId: 'r1-fighter/attack:fighter',
        transform: { kind: 'reroll', keep: 'new' },
        uses: 1,
        dieSelector: { kind: 'intent' },
      },
    ]);
  });
});

describe('applyCondition — durations (ADR-0012)', () => {
  it('resolves the expiry and files the event under the phase it was applied in', () => {
    const ctx = fakeContext();
    const { events } = applyEffect(
      {
        type: 'applyCondition',
        actor: '$target',
        condition: 'blessed',
        duration: { kind: 'permanent' },
      },
      ctx,
    );
    expect(events[0]).toMatchObject({
      kind: 'effectApplied',
      phase: 'modifiers',
      onActorId: 'goblin',
      sourceRuleKey: 'test.rule',
      expiresAt: { kind: 'permanent' },
    });
    expect(ctx.store.conditionsOf('goblin')).toEqual(['blessed']);
  });

  it('applies once per target of a multi-target spell', () => {
    // Bless on three creatures: `$target` means all of them, not the first.
    const ctx = fakeContext({
      step: castStep(['fighter', 'goblin', 'cleric']),
      actors: [actor('fighter'), actor('goblin'), actor('cleric')],
    });
    const { events } = applyEffect(
      {
        type: 'applyCondition',
        actor: '$target',
        condition: 'blessed',
        duration: { kind: 'permanent' },
      },
      ctx,
    );
    expect(events).toHaveLength(3);
    expect(ctx.store.activeEffects().map((e) => e.actorId)).toEqual([
      'fighter',
      'goblin',
      'cleric',
    ]);
  });

  it('anchors a source duration to the acting actor, not the carrier', () => {
    const timelineSteps = [
      attackStep(),
      { id: 'r2-fighter', round: 2, actorId: 'fighter', action: null },
    ];
    const ctx = fakeContext({ timelineSteps });
    const { events } = applyEffect(
      {
        type: 'applyCondition',
        actor: '$target',
        condition: 'blessed',
        duration: { kind: 'rounds', rounds: 1, anchor: { kind: 'source' }, edge: 'end' },
      },
      ctx,
    );
    expect(events[0]).toMatchObject({
      expiresAt: { kind: 'at', point: { round: 2, stepIndex: 1, edge: 'end' } },
    });
  });
});

describe('removeCondition — ends an effect early', () => {
  it('emits one expiry per effect it removed, at the current time', () => {
    const ctx = fakeContext();
    applyEffect(
      {
        type: 'applyCondition',
        actor: '$actor',
        condition: 'blessed',
        duration: { kind: 'permanent' },
      },
      ctx,
    );
    const { events } = applyEffect(
      { type: 'removeCondition', actor: '$actor', condition: 'blessed' },
      ctx,
    );
    expect(events[0]).toMatchObject({ kind: 'expiry', sourceRuleKey: 'test.rule' });
    expect(ctx.store.activeEffects()).toEqual([]);
  });

  it('is silent when the actor never had the condition', () => {
    const ctx = fakeContext();
    expect(
      applyEffect({ type: 'removeCondition', actor: '$actor', condition: 'blessed' }, ctx).events,
    ).toEqual([]);
  });
});

describe('emitEvent and halt — control (ADR-0011)', () => {
  it('emits both a trace event and an outcome event, carrying its data', () => {
    const ctx = fakeContext();
    const application = applyEffect(
      { type: 'emitEvent', event: 'weapon.mastery.applied', data: { weapon: 'longsword' } },
      ctx,
    );
    expect(application.events[0]).toMatchObject({
      kind: 'event',
      event: 'weapon.mastery.applied',
      data: { weapon: 'longsword' },
    });
    expect(application.emitted).toEqual([
      { stepId: 'r1-fighter', event: 'weapon.mastery.applied', data: { weapon: 'longsword' } },
    ]);
  });

  it('omits data entirely rather than setting it undefined', () => {
    const ctx = fakeContext();
    const [event] = applyEffect({ type: 'emitEvent', event: 'plain' }, ctx).events;
    expect(event !== undefined && 'data' in event).toBe(false);
  });

  it('reports the halt with the rule that raised it and emits no event of its own', () => {
    const ctx = fakeContext({ ruleKey: 'combat.surprise' });
    const application = applyEffect(
      { type: 'halt', reason: 'surprised creatures cannot act' },
      ctx,
    );
    expect(application.halt).toEqual({
      ruleKey: 'combat.surprise',
      reason: 'surprised creatures cannot act',
    });
    expect(application.events).toEqual([]);
  });
});
