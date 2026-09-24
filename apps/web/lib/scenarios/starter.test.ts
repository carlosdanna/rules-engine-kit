import {
  blankSituation,
  type Fixture,
  Situation as SituationSchema,
  TemplateRenderError,
} from '@rules-engine-kit/engine';
import { describe, expect, it } from 'vitest';
import { starterSituation } from './starter';

const CITATION = { source: 'srd-5.1', section: 'Monsters' };
const stats = {
  proficiencyBonus: 2,
  abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  resistances: [],
  vulnerabilities: [],
};

/** Two goblins, one per edition, like `content/fixtures/`: the profile decides which one. */
const FIXTURES: Fixture[] = [
  {
    slug: 'goblin',
    kind: 'actor',
    rulesetScope: ['srd-5.1'],
    citation: CITATION,
    interpretation: null,
    data: { name: 'Goblin', ac: 15, hp: 7, ...stats },
  },
  {
    slug: 'goblin',
    kind: 'actor',
    rulesetScope: ['srd-5.2.1'],
    citation: CITATION,
    interpretation: null,
    data: { name: 'Goblin', ac: 15, hp: 10, ...stats },
  },
  {
    slug: 'fighter-3',
    kind: 'actor',
    rulesetScope: ['srd-5.1', 'srd-5.2.1'],
    citation: CITATION,
    interpretation: null,
    data: { name: 'Fighter', ac: 18, hp: 28, ...stats },
  },
];

describe('starterSituation', () => {
  it('is the plain blank situation when no actor is picked', () => {
    expect(
      starterSituation({
        fixtures: FIXTURES,
        profile: 'srd-5.1',
        actorSlugs: [],
        action: 'attack',
      }),
    ).toEqual(blankSituation());
  });

  it('inlines the variant scoped to the chosen profile', () => {
    const under51 = starterSituation({
      fixtures: FIXTURES,
      profile: 'srd-5.1',
      actorSlugs: ['goblin'],
      action: 'none',
    });
    const under521 = starterSituation({
      fixtures: FIXTURES,
      profile: 'srd-5.2.1',
      actorSlugs: ['goblin'],
      action: 'none',
    });
    expect(under51.actors[0]?.hp).toBe(7);
    expect(under521.actors[0]?.hp).toBe(10);
  });

  it('gives each actor a round-1 step in the order picked, and the first attacks the second', () => {
    const situation = starterSituation({
      fixtures: FIXTURES,
      profile: 'srd-5.1',
      actorSlugs: ['fighter-3', 'goblin', 'goblin'],
      action: 'attack',
    });
    expect(situation.actors.map((actor) => actor.id)).toEqual(['fighter-3', 'goblin', 'goblin-2']);
    expect(
      situation.timeline.map((step) => [step.id, step.round, step.action?.type ?? null]),
    ).toEqual([
      ['r1-fighter-3', 1, 'attack'],
      ['r1-goblin', 1, null],
      ['r1-goblin-2', 1, null],
    ]);
    expect(situation.timeline[0]?.action).toMatchObject({ targetId: 'goblin', weapon: null });
    expect(SituationSchema.safeParse(situation).success).toBe(true);
  });

  it('refuses a slug with nothing behind it under the profile', () => {
    expect(() =>
      starterSituation({
        fixtures: FIXTURES,
        profile: 'srd-5.1',
        actorSlugs: ['ogre'],
        action: 'none',
      }),
    ).toThrow(TemplateRenderError);
  });
});
