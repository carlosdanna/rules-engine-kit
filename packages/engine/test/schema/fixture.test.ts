/**
 * The fixture schema's contract is `docs/content-authoring.md` § Fixture, so the examples
 * in that document are the test cases — the same arrangement `test/content/normalize.test.ts`
 * uses for rule packs.
 *
 * The one place this file is stricter than the document is `proficiencyBonus`: FR-8 lists it
 * among the printed values a fixture supplies and `Actor` (`schema/situation.ts`) requires it,
 * so an actor fixture without one could not render into a valid situation (ADR-0017).
 */

import { describe, expect, it } from 'vitest';
import { Fixture } from '../../src/schema';

const CITATION = { source: 'srd-5.2.1', section: 'Monsters > Goblin' };

const GOBLIN = {
  slug: 'goblin',
  kind: 'actor',
  rulesetScope: ['srd-5.1', 'srd-5.2.1'],
  data: {
    name: 'Goblin',
    ac: 15,
    hp: 7,
    proficiencyBonus: 2,
    abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
    resistances: [],
    vulnerabilities: [],
  },
  citation: CITATION,
};

const LONGSWORD = {
  slug: 'longsword',
  kind: 'item',
  rulesetScope: ['srd-5.1', 'srd-5.2.1'],
  data: {
    name: 'Longsword',
    damage: { dice: { count: 1, sides: 8 }, type: 'slashing' },
    properties: ['versatile'],
    mastery: 'sap',
  },
  citation: { source: 'srd-5.2.1', section: 'Equipment > Weapons' },
};

describe('the documented actor fixture', () => {
  it('parses', () => {
    expect(Fixture.parse(GOBLIN)).toEqual(GOBLIN);
  });

  it('needs at least one ruleset scope: a fixture no profile can see is dead content', () => {
    expect(() => Fixture.parse({ ...GOBLIN, rulesetScope: [] })).toThrow();
  });

  it('needs a citation (FR-17, CONTRIBUTING.md)', () => {
    const { citation: _citation, ...uncited } = GOBLIN;
    expect(() => Fixture.parse(uncited)).toThrow();
  });

  it('rejects a citation missing its section', () => {
    expect(() => Fixture.parse({ ...GOBLIN, citation: { source: 'srd-5.2.1' } })).toThrow();
  });

  it('carries printed values only: no derived AC, attack bonus or save DC (FR-8)', () => {
    const derived = { ...GOBLIN, data: { ...GOBLIN.data, attackBonus: 4 } };
    expect(() => Fixture.parse(derived)).toThrow();
  });

  it('rejects an actor fixture with no proficiency bonus (FR-8)', () => {
    const { proficiencyBonus: _pb, ...data } = GOBLIN.data;
    expect(() => Fixture.parse({ ...GOBLIN, data })).toThrow();
  });
});

describe('the documented item fixture', () => {
  it('parses', () => {
    expect(Fixture.parse(LONGSWORD)).toEqual(LONGSWORD);
  });

  it('takes a null mastery, so one fixture serves both editions', () => {
    const scoped = { ...LONGSWORD, data: { ...LONGSWORD.data, mastery: null } };
    expect(Fixture.parse(scoped)).toEqual(scoped);
  });

  it('takes a null damage, for an item that deals none of its own', () => {
    const shield = { ...LONGSWORD, slug: 'shield', data: { ...LONGSWORD.data, damage: null } };
    expect(Fixture.parse(shield)).toEqual(shield);
  });

  it('wants a canonical DiceExpr, not notation: the loader normalises `1d8` before this', () => {
    const authored = {
      ...LONGSWORD,
      data: { ...LONGSWORD.data, damage: { dice: '1d8', type: 'slashing' } },
    };
    expect(() => Fixture.parse(authored)).toThrow();
  });
});

describe('fixture kinds', () => {
  it('rejects a kind the authoring document does not specify', () => {
    // `architecture.md` lists an `effect` fixture; nothing says what its `data` holds.
    expect(() => Fixture.parse({ ...GOBLIN, kind: 'effect' })).toThrow();
  });

  it('rejects actor data on an item fixture', () => {
    expect(() => Fixture.parse({ ...GOBLIN, kind: 'item' })).toThrow();
  });
});
