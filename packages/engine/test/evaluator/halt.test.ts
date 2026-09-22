import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/evaluator';
import { resolveProfile } from '../../src/resolver';
import { add, base, facts, situation } from './fixtures';

/** A surprise-style rule: halts in `declare`, before anything is rolled. */
const surprise = add('combat.surprise', {
  phase: 'declare',
  priority: 0,
  effects: [{ type: 'halt', reason: 'a surprised creature cannot act on its first turn' }],
});

const laterRules = [
  add('modifiers.later', { phase: 'modifiers' }),
  add('damage.later', { phase: 'damage' }),
];

const profile = resolveProfile([base([surprise, ...laterRules])]);
const run = () => evaluate(situation(), profile, { seed: 'demo-seed', facts });

describe('halt — ends the step, not the phase and not the run', () => {
  it('records the halt on the step outcome with the rule and reason', () => {
    expect(run().outcome.steps[0]?.halted).toEqual({
      ruleKey: 'combat.surprise',
      reason: 'a surprised creature cannot act on its first turn',
    });
  });

  it('rolls nothing and compares nothing after the halt', () => {
    const { outcome, trace } = run();
    expect(outcome.steps[0]?.rolls).toEqual([]);
    expect(outcome.steps[0]?.comparisons).toEqual([]);
    expect(trace.events.some((event) => event.kind === 'roll')).toBe(false);
    expect(trace.events.some((event) => event.kind === 'compare')).toBe(false);
  });

  it('still records every later rule, in its own phase, naming what halted it', () => {
    // ADR-0010's invariant holds through a halt: "why not" must be answerable for a
    // damage-phase rule in a step that never reached the damage phase.
    const ruleEvents = run().trace.events.filter((event) => event.kind === 'rule');
    expect(ruleEvents.map((event) => [event.ruleKey, event.phase, event.status])).toEqual([
      ['combat.surprise', 'declare', 'fired'],
      ['modifiers.later', 'modifiers', 'skipped'],
      ['damage.later', 'damage', 'skipped'],
    ]);
    expect(ruleEvents[1]).toMatchObject({
      reason: { kind: 'haltedEarlier', byRuleKey: 'combat.surprise' },
      conditionResult: null,
    });
  });

  it('does not evaluate the conditions of the rules it skipped', () => {
    const withCondition = resolveProfile([
      base([
        surprise,
        add('reads.nothing', {
          phase: 'modifiers',
          condition: { '>=': [{ var: 'step.round' }, 1] },
        }),
      ]),
    ]);
    const { trace } = evaluate(situation(), withCondition, { seed: 'demo-seed', facts });
    const skipped = trace.events.filter((e) => e.kind === 'rule')[1];
    expect(skipped?.kind === 'rule' && skipped.factsRead).toEqual([]);
  });

  it('does not halt the next step of the timeline', () => {
    const twoSteps = situation({
      timeline: [
        { id: 'r1-fighter', round: 1, actorId: 'fighter', action: null },
        { id: 'r2-fighter', round: 2, actorId: 'fighter', action: null },
      ],
    });
    const outcome = evaluate(twoSteps, profile, { seed: 'demo-seed', facts }).outcome;
    expect(outcome.steps.map((step) => step.halted !== null)).toEqual([true, true]);
    expect(outcome.steps).toHaveLength(2);
  });
});

describe('halt — the expire sweep still runs (ADR-0012)', () => {
  it('expires an effect on the step that halted, because expiry is a comparison', () => {
    // Expiry is a comparison against the timeline, not something rules drive. Whether a
    // creature was surprised must not change when a spell ends.
    const withBless = resolveProfile([
      base([
        add('spell.bless', {
          phase: 'upkeep',
          priority: -10,
          effects: [
            {
              type: 'applyCondition',
              actor: '$actor',
              condition: 'blessed',
              duration: { kind: 'instant' },
            },
          ],
        }),
        surprise,
      ]),
    ]);
    const { outcome, trace } = evaluate(situation(), withBless, { seed: 'demo-seed', facts });

    expect(outcome.steps[0]?.halted).not.toBeNull();
    expect(trace.events.some((event) => event.kind === 'expiry')).toBe(true);
    expect(outcome.finalState.activeEffects).toEqual([]);
  });
});

describe('halt — state written before it stands', () => {
  it('keeps the delta of an effect applied before the halting rule ran', () => {
    const before = resolveProfile([
      base([
        add('writes.first', {
          phase: 'declare',
          priority: -10,
          effects: [{ type: 'setValue', path: 'scratch.note', value: 7 }],
        }),
        surprise,
      ]),
    ]);
    const { trace } = evaluate(situation(), before, { seed: 'demo-seed', facts });
    const written = trace.events.find((e) => e.kind === 'rule' && e.ruleKey === 'writes.first');
    expect(written?.kind === 'rule' && written.deltas).toEqual([
      { path: 'scratch.note', from: null, to: 7 },
    ]);
  });
});
