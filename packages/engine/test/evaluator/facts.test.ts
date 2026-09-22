import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createFactRegistry } from '../../src/conditions';
import { createWorldStateStore } from '../../src/effects';
import type { StepResultView } from '../../src/evaluator';
import { createFactSource, FactResolutionError } from '../../src/evaluator';
import type { Actor, Item, Phase, Step } from '../../src/schema';
import { actor } from '../effects/fakeContext';

const registry = createFactRegistry([{ path: 'x', type: z.number() }]);

const attackStep: Step = {
  id: 'r1-fighter',
  round: 1,
  actorId: 'fighter',
  action: { type: 'attack', mode: 'melee', targetId: 'goblin', weapon: null, rangeFt: 5 },
};

const longsword: Item = {
  slug: 'longsword',
  name: 'Longsword',
  damage: { dice: { count: 1, sides: 8 }, type: 'slashing' },
  properties: ['versatile'],
  mastery: 'sap',
};

function sourceOf(
  options: {
    step?: Step;
    sealed?: boolean;
    phase?: Phase;
    items?: Record<string, Item>;
    /** What the `compare` phase has decided so far (ADR-0021). */
    result?: StepResultView;
    actors?: Actor[];
  } = {},
) {
  const store = createWorldStateStore({
    actors: options.actors ?? [
      actor('fighter', { conditions: ['prone'] }),
      actor('goblin', { ac: 13 }),
    ],
    registry,
  });
  const source = createFactSource({
    store,
    step: options.step ?? attackStep,
    stepIndex: 0,
    intents: { useInspiration: true },
    items: options.items ?? {},
    currentPhase: () => options.phase ?? 'modifiers',
    derivedSealed: () => options.sealed ?? true,
    stepResult: () => options.result ?? { kind: 'pending' },
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

  it('reads the two damage lists, which a resistance rule matches a damage type against', () => {
    const actors = [
      actor('fighter', { resistances: ['fire'] }),
      actor('goblin', { vulnerabilities: ['bludgeoning'] }),
    ];
    const { source } = sourceOf({ actors });

    expect(source.read('actor.resistances')).toEqual(['fire']);
    expect(source.read('actor.vulnerabilities')).toEqual([]);
    expect(source.read('target.vulnerabilities')).toEqual(['bludgeoning']);
    expect(source.read('target.resistances')).toEqual([]);
  });

  it('reads the damage lists as printed: unlike conditions, nothing grants one (ADR-0025)', () => {
    const { store, source } = sourceOf({ actors: [actor('fighter'), actor('goblin')] });
    store.addEffect({
      id: 'eff-1',
      sourceRuleKey: 'spell.bless',
      actorId: 'fighter',
      condition: 'blessed',
      duration: { kind: 'permanent' },
      appliedAt: { round: 1, stepIndex: 0, edge: 'start' },
      expiresAt: { kind: 'permanent' },
    });
    expect(source.read('actor.conditions')).toEqual(['blessed']);
    expect(source.read('actor.resistances')).toEqual([]);
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
      stepId: 'r1-fighter',
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

describe('createFactSource — the wielded item, inlined into the situation (ADR-0017)', () => {
  const armed = {
    step: { ...attackStep, action: { ...attackStep.action, weapon: 'longsword' } } as Step,
    items: { longsword },
  };

  it('reads the weapon fields a rule needs, including 5.2.1 mastery', () => {
    const { source } = sourceOf(armed);

    expect(source.read('action.weapon.name')).toBe('Longsword');
    expect(source.read('action.weapon.mastery')).toBe('sap');
    expect(source.read('action.weapon.properties')).toEqual(['versatile']);
  });

  it('reads the slug through the bare path, so a rule can still compare names', () => {
    expect(sourceOf(armed).source.read('action.weapon')).toBe('longsword');
  });

  it('serves the damage dice as notation and as numbers, both registrable fact types', () => {
    const { source } = sourceOf(armed);

    expect(source.read('action.weapon.damage.dice')).toBe('1d8');
    expect(source.read('action.weapon.damage.count')).toBe(1);
    expect(source.read('action.weapon.damage.sides')).toBe(8);
    expect(source.read('action.weapon.damage.type')).toBe('slashing');
  });

  it('reads null for an unarmed attack rather than throwing: fighting bare-handed is legal', () => {
    expect(sourceOf().source.read('action.weapon.mastery')).toBeNull();
  });

  it('reads null for a weapon with no mastery, which is every 5.1-scoped fixture', () => {
    const { source } = sourceOf({
      ...armed,
      items: { longsword: { ...longsword, mastery: null } },
    });

    expect(source.read('action.weapon.mastery')).toBeNull();
  });

  it('refuses an item field the engine does not serve, rather than reading null', () => {
    const { source } = sourceOf(armed);

    expect(() => source.read('action.weapon.weight')).toThrow(FactResolutionError);
  });
});

describe("createFactSource — the step's roll result (ADR-0021)", () => {
  const decided: StepResultView = { kind: 'decided', result: 'hit', natural: 17, total: 22 };

  it('serves the result, the natural die and the total once `compare` has run', () => {
    const { source } = sourceOf({ phase: 'damage', result: decided });

    expect(source.read('step.attack.result')).toBe('hit');
    // The kept die before modifiers — what a crit reads, and not the 22 it totalled to.
    expect(source.read('step.attack.natural')).toBe(17);
    expect(source.read('step.attack.total')).toBe(22);
  });

  it('serves a check or save result through the same paths', () => {
    const save: StepResultView = { kind: 'decided', result: 'failure', natural: 4, total: 6 };

    expect(sourceOf({ phase: 'damage', result: save }).source.read('step.attack.result')).toBe(
      'failure',
    );
  });

  it('refuses the read before `compare` has decided, rather than answering null', () => {
    // ADR-0013's principle: a value that does not exist yet is an error. A rule in
    // `modifiers` asking whether the attack hit would be forward chaining (ADR-0003).
    const { source } = sourceOf({ phase: 'modifiers', result: { kind: 'pending' } });

    expect(() => source.read('step.attack.result')).toThrow(FactResolutionError);
    expect(() => source.read('step.attack.result')).toThrow(/compare/);
  });

  it('says so when the step makes no d20 roll at all', () => {
    const { source } = sourceOf({ phase: 'damage', result: { kind: 'none' } });

    expect(() => source.read('step.attack.result')).toThrow(/no d20/);
  });

  it('still refuses a `step.` path the engine does not serve', () => {
    const { source } = sourceOf({ phase: 'damage', result: decided });

    expect(() => source.read('step.attack.margin')).toThrow(FactResolutionError);
  });
});
