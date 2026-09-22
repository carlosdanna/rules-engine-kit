import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createFactRegistry } from '../../src/conditions';
import { createWorldStateStore } from '../../src/effects';
import { createFactSource, FactResolutionError } from '../../src/evaluator';
import type { Phase, Step } from '../../src/schema';
import { actor } from '../effects/fakeContext';

const registry = createFactRegistry([{ path: 'x', type: z.number() }]);

const attackStep: Step = {
  id: 'r1-fighter',
  round: 1,
  actorId: 'fighter',
  action: { type: 'attack', mode: 'melee', targetId: 'goblin', weapon: null, rangeFt: 5 },
};

function sourceOf(options: { step?: Step; sealed?: boolean; phase?: Phase } = {}) {
  const store = createWorldStateStore({
    actors: [actor('fighter', { conditions: ['prone'] }), actor('goblin', { ac: 13 })],
    registry,
  });
  const source = createFactSource({
    store,
    step: options.step ?? attackStep,
    stepIndex: 0,
    intents: { useInspiration: true },
    currentPhase: () => options.phase ?? 'modifiers',
    derivedSealed: () => options.sealed ?? true,
  });
  return { store, source };
}

describe('createFactSource — actor paths (ADR-0006)', () => {
  it('rewrites a bare actor path to whoever is taking the step', () => {
    expect(sourceOf().source.read('actor.proficiencyBonus')).toBe(2);
  });

  it('derives the ability modifier arithmetically: 16 str reads +3', () => {
    // ADR-0006: fixtures hold printed scores; `(16 - 10) / 2` is not a rule worth citing.
    expect(sourceOf().source.read('actor.abilityMod.str')).toBe(3);
    expect(sourceOf().source.read('actor.abilityMod.cha')).toBe(-1);
  });

  it('reads the printed score separately from the modifier', () => {
    expect(sourceOf().source.read('actor.abilities.str')).toBe(16);
  });

  it('reads conditions as printed plus granted', () => {
    const { store, source } = sourceOf();
    store.addEffect({
      id: 'eff-1',
      sourceRuleKey: 'spell.bless',
      actorId: 'fighter',
      condition: 'blessed',
      duration: { kind: 'permanent' },
      appliedAt: { round: 1, stepIndex: 0, edge: 'start' },
      expiresAt: { kind: 'permanent' },
    });
    expect(source.read('actor.conditions')).toEqual(['prone', 'blessed']);
  });

  it('resolves target.* to the action’s target', () => {
    expect(sourceOf().source.read('target.ac')).toBe(13);
  });

  it('refuses target.* when the action declares no target', () => {
    const step: Step = { id: 's', round: 1, actorId: 'fighter', action: null };
    expect(() => sourceOf({ step }).source.read('target.ac')).toThrow(FactResolutionError);
  });
});

describe('createFactSource — step, action and intents', () => {
  it('reads the step and its index', () => {
    const { source } = sourceOf();
    expect(source.read('step.round')).toBe(1);
    expect(source.read('step.actorId')).toBe('fighter');
    expect(source.read('step.index')).toBe(0);
  });

  it('reads the declared action', () => {
    const { source } = sourceOf();
    expect(source.read('action.type')).toBe('attack');
    expect(source.read('action.rangeFt')).toBe(5);
  });

  it('reads null for a field this action kind does not have', () => {
    // A `<=` against null then throws rather than silently skipping the rule (FR-17);
    // rules guard on `action.type` first and `all` short-circuits (ADR-0013).
    const step: Step = {
      id: 's',
      round: 1,
      actorId: 'fighter',
      action: { type: 'check', ability: 'dex', skill: null, dc: 15 },
    };
    expect(sourceOf({ step }).source.read('action.rangeFt')).toBeNull();
  });

  it("reads 'none' rather than null when the step takes no action", () => {
    // `action.type` is the fact every condition guards on first, and a step that takes no
    // action is legal (`Step.action` is nullable). Were this null, the guard itself would
    // throw on a valid step; "took no action" is a value, not an absence.
    const step: Step = { id: 's', round: 1, actorId: 'fighter', action: null };
    expect(sourceOf({ step }).source.read('action.type')).toBe('none');
  });

  it('still reads null for the other action paths of a step with no action', () => {
    const step: Step = { id: 's', round: 1, actorId: 'fighter', action: null };
    expect(sourceOf({ step }).source.read('action.rangeFt')).toBeNull();
  });

  it('reads a named intent declared up front (ADR-0003)', () => {
    expect(sourceOf().source.read('intents.useInspiration')).toBe(true);
    expect(sourceOf().source.read('intents.notDeclared')).toBeNull();
  });
});

describe('createFactSource — derived values are sealed, not partial (ADR-0003, ADR-0006)', () => {
  it('refuses a derived read before the seal, naming the path and the phase', () => {
    const { source } = sourceOf({ sealed: false, phase: 'modifiers' });
    expect(() => source.read('actor.ac.effective')).toThrow(FactResolutionError);
    expect(() => source.read('actor.ac.effective')).toThrow(/forward chaining/);
  });

  it('reads the sealed total once the modifiers phase has finished', () => {
    const { store, source } = sourceOf({ sealed: true });
    store.sealDerived({
      path: 'actor.ac.effective',
      actorId: 'fighter',
      base: 15,
      terms: [{ source: 'dnd5e-srd', ruleKey: 'cover.half', value: 2, modifierType: 'cover' }],
      total: 17,
    });
    expect(source.read('actor.ac.effective')).toBe(17);
  });

  it('reads null for a derived path nothing sealed a value for', () => {
    expect(sourceOf({ sealed: true }).source.read('actor.ac.effective')).toBeNull();
  });
});
