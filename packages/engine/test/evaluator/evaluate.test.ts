import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/evaluator';
import { resolveProfile } from '../../src/resolver';
import { Outcome, PHASES, Trace } from '../../src/schema';
import { ENGINE_VERSION } from '../../src/version';
import { add, base, disable, facts, layer, situation } from './fixtures';

const abilityBonus = add('stat.ability-mod', {
  phase: 'modifiers',
  priority: 10,
  effects: [
    {
      type: 'addModifier',
      target: { kind: 'attack', actor: '$actor' },
      value: 3,
      modifierType: 'ability',
      policy: 'sum',
    },
  ],
});

const profile = resolveProfile([base([abilityBonus])]);
const run = (overrides = {}) =>
  evaluate(situation(), profile, { seed: 'demo-seed', facts, ...overrides });

describe('evaluate — shape of the result (FR-3, VR-7)', () => {
  it('returns an outcome and a trace that both parse against the schema', () => {
    const { outcome, trace } = run();
    expect(() => Outcome.parse(outcome)).not.toThrow();
    expect(() => Trace.parse(trace)).not.toThrow();
  });

  it('records what produced the run, so a replay can be honest about it', () => {
    const { outcome } = run();
    expect(outcome.seed).toBe('demo-seed');
    expect(outcome.profileHash).toBe(profile.hash);
    expect(outcome.engineVersion).toBe(ENGINE_VERSION);
  });

  it('returns one step outcome per step of the timeline (ADR-0005)', () => {
    const { outcome } = run();
    expect(outcome.steps.map((step) => step.stepId)).toEqual(['r1-fighter']);
  });

  it('never mutates the situation it was given', () => {
    const input = situation();
    const snapshot = structuredClone(input);
    evaluate(input, profile, { seed: 'demo-seed', facts });
    expect(input).toEqual(snapshot);
  });

  it('validates the situation rather than trusting it (FR-1)', () => {
    const broken = { ...situation(), actors: [] };
    expect(() => evaluate(broken as never, profile, { seed: 'demo-seed', facts })).toThrow();
  });
});

describe('evaluate — determinism (NFR-1)', () => {
  it('produces a deep-equal outcome and trace for the same seed', () => {
    expect(run()).toEqual(run());
  });

  it('produces a different roll for a different seed', () => {
    const a = run({ seed: 'seed-a' }).outcome.steps[0]?.rolls[0]?.kept;
    const b = run({ seed: 'seed-zzz' }).outcome.steps[0]?.rolls[0]?.kept;
    expect(a).not.toBe(b);
  });

  it('honours a forced roll keyed by roll id (FR-13, ADR-0011)', () => {
    const forced = run({ forcedRolls: { 'r1-fighter/attack:fighter': [17] } });
    expect(forced.outcome.steps[0]?.rolls[0]).toMatchObject({
      kept: 17,
      total: 20,
      forced: true,
    });
  });
});

describe('evaluate — every selected rule is recorded (FR-14, ADR-0010)', () => {
  it('emits exactly one rule event per rule per step', () => {
    const { trace } = run();
    const ruleEvents = trace.events.filter((event) => event.kind === 'rule');
    expect(ruleEvents).toHaveLength(1);
    expect(ruleEvents[0]).toMatchObject({ ruleKey: 'stat.ability-mod', status: 'fired' });
  });

  it('records a disabled rule with the layer that disabled it (ADR-0009)', () => {
    const disabled = resolveProfile([base([abilityBonus]), layer([disable('stat.ability-mod')])]);
    const { trace } = evaluate(situation(), disabled, { seed: 'demo-seed', facts });
    expect(trace.events.filter((e) => e.kind === 'rule')[0]).toMatchObject({
      status: 'disabled',
      reason: { kind: 'disabledByLayer', layer: 'house-rules' },
      conditionResult: null,
    });
  });

  it('records a skipped rule with the sub-condition that failed (ADR-0013)', () => {
    const guarded = resolveProfile([
      base([
        add('needs.prone', {
          condition: { in: ['prone', { var: 'actor.conditions' }] },
        }),
      ]),
    ]);
    const { trace } = evaluate(situation(), guarded, { seed: 'demo-seed', facts });
    expect(trace.events.filter((e) => e.kind === 'rule')[0]).toMatchObject({
      status: 'skipped',
      conditionResult: false,
      reason: { kind: 'conditionFalse', failedAt: '/in' },
    });
  });

  it('records the facts a condition read, with their values, in read order', () => {
    const guarded = resolveProfile([
      base([add('reads.round', { condition: { '>=': [{ var: 'step.round' }, 1] } })]),
    ]);
    const { trace } = evaluate(situation(), guarded, { seed: 'demo-seed', facts });
    const event = trace.events.find((e) => e.kind === 'rule');
    expect(event?.kind === 'rule' && event.factsRead).toEqual([{ path: 'step.round', value: 1 }]);
  });

  it("drops non-fired rule events under traceLevel 'fired-only'", () => {
    const guarded = resolveProfile([
      base([add('never', { condition: { '>=': [{ var: 'step.round' }, 99] } })]),
    ]);
    const { trace } = evaluate(situation(), guarded, {
      seed: 'demo-seed',
      facts,
      traceLevel: 'fired-only',
    });
    expect(trace.events.filter((e) => e.kind === 'rule')).toEqual([]);
  });
});

describe('evaluate — phase order (FR-9)', () => {
  it('runs each step through the eight fixed phases in order', () => {
    const everyPhase = resolveProfile([
      base(PHASES.map((phase) => add(`rule.${phase}`, { phase }))),
    ]);
    const { trace } = evaluate(situation(), everyPhase, { seed: 'demo-seed', facts });
    expect(
      trace.events.filter((event) => event.kind === 'rule').map((event) => event.phase),
    ).toEqual([...PHASES]);
  });

  it('orders rules within a phase by priority, then key', () => {
    const ordered = resolveProfile([
      base([
        add('z.last', { phase: 'declare', priority: 10 }),
        add('a.first', { phase: 'declare', priority: 10 }),
        add('m.early', { phase: 'declare', priority: -5 }),
      ]),
    ]);
    const { trace } = evaluate(situation(), ordered, { seed: 'demo-seed', facts });
    expect(
      trace.events.filter((event) => event.kind === 'rule').map((event) => event.ruleKey),
    ).toEqual(['m.early', 'a.first', 'z.last']);
  });
});
