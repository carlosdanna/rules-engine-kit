import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createFactRegistry } from '../../src/conditions';
import { createStepBus, createWorldStateStore } from '../../src/effects';
import { sealDerivedValues } from '../../src/evaluator';
import type { ResolvedRule, Step } from '../../src/schema';
import { actor } from '../effects/fakeContext';

const registry = createFactRegistry([{ path: 'x', type: z.number() }]);
const step: Step = { id: 'r1-fighter', round: 1, actorId: 'fighter', action: null };

function rule(key: string, layer: string): ResolvedRule {
  return {
    key,
    phase: 'modifiers',
    priority: 0,
    label: key,
    description: key,
    tags: [],
    condition: null,
    effects: [],
    citation: { source: 'srd-5.2.1', section: 'test' },
    interpretation: null,
    enabled: true,
    provenance: [{ layer, version: '5.2.1', op: 'add' }],
  };
}

function seal(modifiers: { ruleKey: string; value: number; type: string }[], layer = 'dnd5e-srd') {
  const store = createWorldStateStore({ actors: [actor('goblin', { ac: 15 })], registry });
  const bus = createStepBus();
  for (const m of modifiers) {
    bus.addDerivedModifier('actor.ac.effective', 'goblin', {
      ruleKey: m.ruleKey,
      modifierType: m.type,
      policy: 'highest',
      value: m.value,
    });
  }
  const rulesByKey = new Map(modifiers.map((m) => [m.ruleKey, rule(m.ruleKey, layer)]));
  return { store, ...sealDerivedValues({ bus, store, step, rulesByKey }) };
}

describe('sealDerivedValues — effective AC from printed AC plus terms (ADR-0006, FR-8)', () => {
  it('starts from the printed AC and reports every contributing term', () => {
    const { derived } = seal([{ ruleKey: 'cover.half', value: 2, type: 'cover' }]);
    expect(derived[0]).toMatchObject({
      path: 'actor.ac.effective',
      actorId: 'goblin',
      base: 15,
      total: 17,
    });
    expect(derived[0]?.terms).toEqual([
      { source: 'dnd5e-srd', ruleKey: 'cover.half', value: 2, modifierType: 'cover' },
    ]);
  });

  it('names the layer a term came from, which ruleKey and modifierType do not', () => {
    const { derived } = seal([{ ruleKey: 'house.cover', value: 3, type: 'cover' }], 'house-rules');
    expect(derived[0]?.terms[0]?.source).toBe('house-rules');
  });

  it('makes the sealed total readable from the store', () => {
    const { store } = seal([{ ruleKey: 'cover.half', value: 2, type: 'cover' }]);
    expect(store.derivedValue('actor.ac.effective', 'goblin')?.total).toBe(17);
  });

  it('seals a declared group with no contributors at its base', () => {
    const store = createWorldStateStore({ actors: [actor('goblin', { ac: 15 })], registry });
    const bus = createStepBus();
    bus.declareDerived('actor.ac.effective', 'goblin');
    const { derived } = sealDerivedValues({ bus, store, step, rulesByKey: new Map() });
    expect(derived[0]).toMatchObject({ base: 15, total: 15, terms: [] });
  });

  it('starts an unregistered base at zero rather than guessing', () => {
    const store = createWorldStateStore({ actors: [actor('fighter')], registry });
    const bus = createStepBus();
    bus.addDerivedModifier('roll.attack.bonus', 'fighter', {
      ruleKey: 'stat.ability',
      modifierType: 'ability',
      policy: 'sum',
      value: 3,
    });
    const { derived } = sealDerivedValues({ bus, store, step, rulesByKey: new Map() });
    expect(derived[0]).toMatchObject({ base: 0, total: 3 });
  });
});

describe('sealDerivedValues — stacking events are for non-roll targets only (ADR-0014)', () => {
  it('emits a stacking event for effective AC, encoding the actor into the target', () => {
    const { events } = seal([
      { ruleKey: 'cover.half', value: 2, type: 'cover' },
      { ruleKey: 'cover.quarter', value: 1, type: 'cover' },
    ]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: 'stacking',
      // `stacking.target` is a bare string in the schema, so the actor rides in the label.
      target: 'actor.ac.effective@goblin',
      phase: 'modifiers',
    });
  });

  it('records what the policy dropped alongside what it applied', () => {
    const { events } = seal([
      { ruleKey: 'cover.half', value: 2, type: 'cover' },
      { ruleKey: 'cover.quarter', value: 1, type: 'cover' },
    ]);
    const event = events[0];
    expect(event?.kind === 'stacking' && event.applied.map((m) => m.ruleKey)).toEqual([
      'cover.half',
    ]);
    expect(event?.kind === 'stacking' && event.dropped[0]?.beatenBy).toBe('cover.half');
  });

  it('emits no stacking event for a roll target, which carries its own on the roll event', () => {
    const store = createWorldStateStore({ actors: [actor('fighter')], registry });
    const bus = createStepBus();
    bus.addDerivedModifier('roll.attack.bonus', 'fighter', {
      ruleKey: 'stat.ability',
      modifierType: 'ability',
      policy: 'sum',
      value: 3,
    });
    const { derived, events } = sealDerivedValues({ bus, store, step, rulesByKey: new Map() });
    expect(derived).toHaveLength(1);
    expect(events).toEqual([]);
  });
});
