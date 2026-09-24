import {
  type ActorFixture,
  blankSituation,
  type ItemFixture,
  Situation as SituationSchema,
} from '@rules-engine-kit/engine';
import { describe, expect, it } from 'vitest';
import {
  addActorFromFixture,
  addBlankActor,
  addItemFromFixture,
  addStep,
  defaultAction,
  freshId,
  removeActor,
  removeItem,
  setAction,
  setIntent,
} from './situation-edits';

const GOBLIN: ActorFixture = {
  slug: 'goblin',
  kind: 'actor',
  rulesetScope: ['srd-5.1'],
  citation: { source: 'srd-5.1', section: 'Monsters > Goblin' },
  interpretation: null,
  data: {
    name: 'Goblin',
    ac: 15,
    hp: 7,
    proficiencyBonus: 2,
    abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
    resistances: [],
    vulnerabilities: [],
  },
};

const LONGSWORD: ItemFixture = {
  slug: 'longsword',
  kind: 'item',
  rulesetScope: ['srd-5.1'],
  citation: { source: 'srd-5.2.1', section: 'Equipment > Weapons' },
  interpretation: null,
  data: {
    name: 'Longsword',
    damage: { dice: { count: 1, sides: 8 }, type: 'slashing' },
    properties: ['versatile'],
    mastery: 'sap',
  },
};

/** Every edit must hand back something the schema accepts, or the form would stop rendering. */
const valid = (situation: unknown) =>
  expect(SituationSchema.safeParse(situation).success).toBe(true);

describe('freshId', () => {
  it('uses the base when it is free and numbers it from 2 otherwise', () => {
    expect(freshId([], 'goblin')).toBe('goblin');
    expect(freshId(['goblin'], 'goblin')).toBe('goblin-2');
    expect(freshId(['goblin', 'goblin-2'], 'goblin')).toBe('goblin-3');
  });
});

describe('actors', () => {
  it('adds a fixture under an id derived from its slug, twice without clashing', () => {
    const once = addActorFromFixture(blankSituation(), GOBLIN);
    const twice = addActorFromFixture(once, GOBLIN);
    expect(twice.actors.map((actor) => actor.id)).toEqual(['actor', 'goblin', 'goblin-2']);
    expect(twice.actors[1]).toMatchObject({ name: 'Goblin', hp: 7, hpCurrent: 7, ac: 15 });
    valid(twice);
  });

  it('a blank actor copies the first one’s numbers but none of its conditions', () => {
    const start = blankSituation();
    const withCondition = {
      ...start,
      actors: start.actors.map((actor) => ({ ...actor, conditions: ['prone'] })),
    };
    const next = addBlankActor(withCondition);
    expect(next.actors[1]).toMatchObject({ id: 'actor-2', name: 'Actor 2', conditions: [] });
    valid(next);
  });

  it('removing an actor drops its steps and clears actions that targeted it', () => {
    let situation = addActorFromFixture(addActorFromFixture(blankSituation(), GOBLIN), GOBLIN);
    situation = addStep(situation);
    situation = setAction(situation, 0, {
      type: 'attack',
      mode: 'melee',
      targetId: 'goblin',
      weapon: null,
      rangeFt: 5,
    });
    situation = setAction(situation, 1, {
      type: 'cast',
      spell: 'bless',
      targetIds: ['goblin', 'goblin-2'],
    });

    const next = removeActor(situation, 1);
    expect(next.actors.map((actor) => actor.id)).toEqual(['actor', 'goblin-2']);
    expect(next.timeline[0]?.action).toBeNull();
    expect(next.timeline[1]?.action).toEqual({
      type: 'cast',
      spell: 'bless',
      targetIds: ['goblin-2'],
    });
    valid(next);
  });
});

describe('items', () => {
  it('adds a weapon once, keyed by its slug', () => {
    const next = addItemFromFixture(addItemFromFixture(blankSituation(), LONGSWORD), LONGSWORD);
    expect(Object.keys(next.items)).toEqual(['longsword']);
    valid(next);
  });

  it('removing a weapon leaves the attacks that used it unarmed', () => {
    let situation = addActorFromFixture(addItemFromFixture(blankSituation(), LONGSWORD), GOBLIN);
    situation = setAction(situation, 0, defaultAction(situation, 0, 'attack'));
    expect(situation.timeline[0]?.action).toMatchObject({ weapon: 'longsword' });

    const next = removeItem(situation, 'longsword');
    expect(next.items).toEqual({});
    expect(next.timeline[0]?.action).toMatchObject({ type: 'attack', weapon: null });
    valid(next);
  });
});

describe('defaultAction', () => {
  const two = addActorFromFixture(blankSituation(), GOBLIN);

  it('points an attack or a cast at somebody other than the actor taking the step', () => {
    expect(defaultAction(two, 0, 'attack')).toEqual({
      type: 'attack',
      mode: 'melee',
      targetId: 'goblin',
      weapon: null,
      rangeFt: 5,
    });
    expect(defaultAction(two, 0, 'cast')).toMatchObject({ targetIds: ['goblin'] });
  });

  it('falls back to the actor itself when there is nobody else', () => {
    expect(defaultAction(blankSituation(), 0, 'attack')).toMatchObject({ targetId: 'actor' });
  });

  it('every type parses in a situation', () => {
    for (const type of ['attack', 'cast', 'check', 'save', 'useObject', null] as const) {
      valid(setAction(two, 0, defaultAction(two, 0, type)));
    }
  });
});

describe('setIntent', () => {
  it('sets a named intent and removes it again when switched off', () => {
    const on = setIntent(blankSituation(), 'useInspiration', true);
    expect(on.intents).toEqual({ useInspiration: true });
    expect(setIntent(on, 'useInspiration', false).intents).toEqual({});
  });
});
