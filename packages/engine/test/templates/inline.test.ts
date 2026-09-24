/**
 * Inlining one fixture into a situation (ADR-0017), the step `renderTemplate` takes for every
 * actor and weapon it names and the scenario editor takes when someone adds one by hand.
 *
 * Expected values are the printed stat block and weapon row, copied from the SRD 5.1 goblin
 * and the longsword in `content/fixtures/`, not read back from the engine.
 */

import { describe, expect, it } from 'vitest';
import { Situation } from '../../src/schema';
import {
  type ActorFixture,
  actorFromFixture,
  type ItemFixture,
  itemFromFixture,
} from '../../src/templates';

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
  rulesetScope: ['srd-5.1', 'srd-5.2.1'],
  citation: { source: 'srd-5.2.1', section: 'Equipment > Weapons > Martial Melee Weapons' },
  interpretation: null,
  data: {
    name: 'Longsword',
    damage: { dice: { count: 1, sides: 8 }, type: 'slashing' },
    properties: ['versatile'],
    mastery: 'sap',
  },
};

describe('actorFromFixture', () => {
  it('copies the printed stats and starts at full health with no conditions', () => {
    expect(actorFromFixture(GOBLIN, { id: 'goblin' })).toEqual({
      id: 'goblin',
      name: 'Goblin',
      ac: 15,
      hp: 7,
      hpCurrent: 7,
      proficiencyBonus: 2,
      abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
      conditions: [],
      resistances: [],
      vulnerabilities: [],
    });
  });

  it('takes a starting hpCurrent and conditions when the caller supplies them', () => {
    const actor = actorFromFixture(GOBLIN, { id: 'g', hpCurrent: 3, conditions: ['prone'] });
    expect(actor.hpCurrent).toBe(3);
    expect(actor.conditions).toEqual(['prone']);
  });
});

describe('itemFromFixture', () => {
  it('keys the item by the fixture slug and keeps its printed values', () => {
    expect(itemFromFixture(LONGSWORD)).toEqual({
      slug: 'longsword',
      name: 'Longsword',
      damage: { dice: { count: 1, sides: 8 }, type: 'slashing' },
      properties: ['versatile'],
      mastery: 'sap',
    });
  });
});

it('the two together make a situation that parses', () => {
  const situation = {
    schemaVersion: 3,
    actors: [actorFromFixture(GOBLIN, { id: 'a' }), actorFromFixture(GOBLIN, { id: 'b' })],
    items: { longsword: itemFromFixture(LONGSWORD) },
    timeline: [
      {
        id: 'r1-a',
        round: 1,
        actorId: 'a',
        action: { type: 'attack', mode: 'melee', targetId: 'b', weapon: 'longsword', rangeFt: 5 },
      },
    ],
    intents: {},
  };
  expect(Situation.safeParse(situation).success).toBe(true);
});
