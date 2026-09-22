/**
 * A hand-built `EffectContext` so each handler can be tested on its own, before the phase
 * loop exists to build a real one. Fixtures, not content.
 */

import { z } from 'zod';
import { createFactRegistry } from '../../src/conditions';
import { createRoller, makeRollId, type Roller } from '../../src/dice';
import { createStepBus, createWorldStateStore, type EffectContext } from '../../src/effects';
import type { Actor, Json, RollId, RollTarget, Step } from '../../src/schema';
import { buildTimelineIndex } from '../../src/time';

export const registry = createFactRegistry([
  { path: 'actor.fighter.hpCurrent', type: z.number() },
  { path: 'actor.goblin.hpCurrent', type: z.number() },
  { path: 'actor.fighter.conditions', type: z.array(z.string()) },
  { path: 'scratch.damage.total', type: z.number() },
  { path: 'world.flag', type: z.boolean() },
]);

export function actor(id: string, overrides: Partial<Actor> = {}): Actor {
  return {
    id,
    name: id[0]?.toUpperCase() + id.slice(1),
    abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 },
    proficiencyBonus: 2,
    ac: 15,
    hp: 30,
    hpCurrent: 30,
    conditions: [],
    ...overrides,
  };
}

export function attackStep(targetId = 'goblin'): Step {
  return {
    id: 'r1-fighter',
    round: 1,
    actorId: 'fighter',
    action: { type: 'attack', mode: 'melee', targetId, weapon: null, rangeFt: 5 },
  };
}

export function castStep(targetIds: string[]): Step {
  return {
    id: 'r1-cleric',
    round: 1,
    actorId: 'cleric',
    action: { type: 'cast', spell: 'bless', targetIds },
  };
}

export function fakeContext(
  options: {
    step?: Step;
    actors?: Actor[];
    ruleKey?: string;
    roller?: Roller;
    timelineSteps?: Step[];
    /** What `readFact` serves an effect whose value is a fact reference (ADR-0021). */
    facts?: Record<string, Json>;
  } = {},
): EffectContext {
  const step = options.step ?? attackStep();
  const actors = options.actors ?? [actor('fighter'), actor('goblin'), actor('cleric')];
  const store = createWorldStateStore({ actors, registry });
  const timeline = buildTimelineIndex(options.timelineSteps ?? [step]);
  let effectCounter = 0;

  const targetsOf = (): string[] => {
    const action = step.action;
    if (action === null) return [];
    if (action.type === 'attack') return [action.targetId];
    if (action.type === 'cast') return [...action.targetIds];
    return [];
  };

  return {
    step,
    stepIndex: 0,
    phase: 'modifiers',
    now: { round: step.round, stepIndex: 0, edge: 'start' },
    ruleKey: options.ruleKey ?? 'test.rule',
    store,
    bus: createStepBus(),
    roller: options.roller ?? createRoller({ seed: 'demo-seed' }),
    timeline,
    resolveActorRefs: (ref) =>
      ref === '$actor' ? [step.actorId] : ref === '$target' ? targetsOf() : [ref],
    readFact: (path: string): Json => {
      const facts = options.facts ?? {};
      // The real source throws on a path it cannot resolve; a fixture that answered `null`
      // for everything would hide exactly the failures ADR-0021 asks to be loud.
      if (!(path in facts)) throw new Error(`fake fact source has no '${path}'`);
      return facts[path] ?? null;
    },
    rollIdFor: (target: RollTarget): RollId => makeRollId(step.id, target),
    derivedChannel: (path, actorId) => `${step.id}/derived:${actorId}:${path}` as RollId,
    nextEffectId: () => `eff-${++effectCounter}`,
  };
}
