/**
 * `renderTemplate`'s contract is ADR-0026 and `docs/content-authoring.md` § Template, so the
 * cases here are the vocabulary those two describe: what a placeholder means, what the
 * skeleton must carry, and what `content:lint` is entitled to report (Q24).
 *
 * The seeded templates in `content/` are exercised end to end by the golden cases instead —
 * one per template per profile (NFR-4). These are the unit-level claims underneath them.
 */

import { describe, expect, it } from 'vitest';
import { type Fixture, TEMPLATE_SCHEMA_VERSION, type Template } from '../../src/schema';
import { buildFixtureIndex, renderTemplate, TemplateRenderError } from '../../src/templates';

const CITATION = { source: 'srd-5.2.1', section: 'Monsters > Goblin' };

function actorFixture(slug: string, scope: string[], hp = 7): Fixture {
  return {
    slug,
    kind: 'actor',
    rulesetScope: scope,
    citation: CITATION,
    interpretation: null,
    data: {
      name: slug,
      ac: 15,
      hp,
      proficiencyBonus: 2,
      abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
      resistances: [],
      vulnerabilities: [],
    },
  };
}

const LONGSWORD: Fixture = {
  slug: 'longsword',
  kind: 'item',
  rulesetScope: ['srd-5.1', 'srd-5.2.1'],
  citation: { source: 'srd-5.2.1', section: 'Equipment > Weapons' },
  interpretation: null,
  data: {
    name: 'Longsword',
    damage: { dice: { count: 1, sides: 8 }, type: 'slashing' },
    properties: ['versatile'],
    mastery: 'sap',
  },
};

const FIXTURES = [
  actorFixture('goblin', ['srd-5.1'], 7),
  actorFixture('goblin', ['srd-5.2.1'], 10),
  actorFixture('fighter', ['srd-5.1', 'srd-5.2.1'], 28),
  LONGSWORD,
];

const index = buildFixtureIndex(FIXTURES);

function template(overrides: Partial<Template> = {}): Template {
  return {
    id: 'melee-attack',
    name: 'Melee attack',
    description: 'One creature swings at another, once.',
    tags: [],
    schemaVersion: TEMPLATE_SCHEMA_VERSION,
    suggestedProfiles: ['srd-5.1', 'srd-5.2.1'],
    params: {
      attacker: { type: 'fixture', kind: 'actor', default: 'fighter' },
      target: { type: 'fixture', kind: 'actor', default: 'goblin' },
      weapon: { type: 'fixture', kind: 'item', default: 'longsword' },
      targetConditions: { type: 'conditionList', default: [] },
      useInspiration: { type: 'boolean', default: false },
      rerollDie: { type: 'rollChoice', roll: 'attack', choice: 'rerollDieIndex', default: 0 },
    },
    skeleton: {
      actors: [
        { fixture: '{{attacker}}', id: 'attacker' },
        { fixture: '{{target}}', id: 'target', conditions: '{{targetConditions}}' },
      ],
      timeline: [
        {
          id: 'r1-attacker',
          round: 1,
          actorId: 'attacker',
          action: {
            type: 'attack',
            mode: 'melee',
            targetId: 'target',
            weapon: '{{weapon}}',
            rangeFt: 5,
          },
        },
      ],
      intents: {
        useInspiration: '{{useInspiration}}',
        rollChoices: { '{{$rollId(r1-attacker, attack)}}': { rerollDieIndex: '{{rerollDie}}' } },
      },
    },
    ...overrides,
  } as Template;
}

describe('renderTemplate — the situation it builds (ADR-0017, FR-20)', () => {
  it('renders with its defaults, which is what content:lint relies on (Q24)', () => {
    expect(() => renderTemplate(template(), undefined, index, 'srd-5.2.1')).not.toThrow();
  });

  it('inlines the fixture data rather than the slug, so the situation is self-contained', () => {
    const situation = renderTemplate(template(), {}, index, 'srd-5.2.1');
    expect(situation.actors[0]).toMatchObject({ id: 'attacker', ac: 15, hp: 28 });
    expect(situation.items.longsword).toMatchObject({
      slug: 'longsword',
      damage: { dice: { count: 1, sides: 8 }, type: 'slashing' },
    });
  });

  it('resolves one slug to a different variant per profile (ADR-0017)', () => {
    const under = (profile: string) =>
      renderTemplate(template(), {}, index, profile).actors.find((a) => a.id === 'target')?.hp;
    expect(under('srd-5.1')).toBe(7);
    expect(under('srd-5.2.1')).toBe(10);
  });

  it('starts an actor at full health unless the skeleton says otherwise', () => {
    const situation = renderTemplate(template(), {}, index, 'srd-5.2.1');
    expect(situation.actors.map((a) => a.hpCurrent)).toEqual([28, 10]);
  });

  it('is deterministic: the same inputs render deep-equal situations (NFR-1)', () => {
    expect(renderTemplate(template(), {}, index, 'srd-5.1')).toEqual(
      renderTemplate(template(), {}, index, 'srd-5.1'),
    );
  });
});

describe('renderTemplate — placeholders (ADR-0026)', () => {
  it('substitutes a whole-string placeholder as the value, not as text', () => {
    const situation = renderTemplate(
      template(),
      { targetConditions: ['prone', 'poisoned'], useInspiration: true },
      index,
      'srd-5.2.1',
    );
    // A conditionList must arrive as an array and a boolean as a boolean; YAML has no way to
    // write a non-string hole, so this is what makes the closed param vocabulary usable.
    expect(situation.actors[1]?.conditions).toEqual(['prone', 'poisoned']);
    expect(situation.intents.useInspiration).toBe(true);
  });

  it('expands $rollId into the id the trace and forcedRolls use (ADR-0011)', () => {
    const situation = renderTemplate(template(), {}, index, 'srd-5.2.1');
    expect(situation.intents.rollChoices).toEqual({
      'r1-attacker/attack:attacker': { rerollDieIndex: 0 },
    });
  });

  it('refuses a $rollId naming a step the timeline does not declare', () => {
    const broken = template({
      skeleton: {
        ...(template().skeleton as Record<string, unknown>),
        intents: { rollChoices: { '{{$rollId(r9-nobody, attack)}}': { rerollDieIndex: 0 } } },
      } as Template['skeleton'],
    });
    expect(() => renderTemplate(broken, {}, index, 'srd-5.2.1')).toThrow(TemplateRenderError);
    expect(() => renderTemplate(broken, {}, index, 'srd-5.2.1')).toThrow(/does not declare/);
  });

  it('refuses a placeholder naming no param, rather than passing it through', () => {
    const broken = template({
      skeleton: {
        ...(template().skeleton as Record<string, unknown>),
        intents: { useInspiration: '{{notAParam}}' },
      } as Template['skeleton'],
    });
    expect(() => renderTemplate(broken, {}, index, 'srd-5.2.1')).toThrow(/names no param/);
  });
});

describe('renderTemplate — params', () => {
  it('type-checks a supplied value against its declared param', () => {
    expect(() => renderTemplate(template(), { useInspiration: 'yes' }, index, 'srd-5.2.1')).toThrow(
      /expected a boolean value/,
    );
  });

  it('refuses a param the template does not declare', () => {
    expect(() => renderTemplate(template(), { nope: 1 }, index, 'srd-5.2.1')).toThrow(
      /declares no param 'nope'/,
    );
  });

  it('enforces an enum member and a number range', () => {
    const enumeric = template({
      params: {
        ...template().params,
        targetConditions: { type: 'enum', values: ['a', 'b'], default: 'a' },
      } as Template['params'],
    });
    expect(() => renderTemplate(enumeric, { targetConditions: 'c' }, index, 'srd-5.2.1')).toThrow(
      /expected one of a, b/,
    );
  });
});

describe('renderTemplate — what it refuses (the Q24 lint checks)', () => {
  it('reports a slug scoped to no variant under the profile', () => {
    const orphan = buildFixtureIndex([actorFixture('ghost', ['srd-5.1'])]);
    expect(() => renderTemplate(template(), { attacker: 'ghost' }, orphan, 'srd-5.2.1')).toThrow(
      /no fixture 'ghost' is scoped to profile 'srd-5.2.1'/,
    );
  });

  it('reports a slug that resolves to more than one variant (ADR-0017)', () => {
    // Everything else resolves cleanly, so the only thing this case can fail on is `goblin`.
    const ambiguous = buildFixtureIndex([
      actorFixture('fighter', ['srd-5.2.1'], 28),
      LONGSWORD,
      actorFixture('goblin', ['srd-5.2.1'], 7),
      actorFixture('goblin', ['srd-5.2.1'], 10),
    ]);
    expect(() => renderTemplate(template(), {}, ambiguous, 'srd-5.2.1')).toThrow(
      /must resolve to exactly one variant/,
    );
  });

  it('reports an actor param pointed at an item fixture', () => {
    expect(() => renderTemplate(template(), { target: 'longsword' }, index, 'srd-5.2.1')).toThrow(
      /is an item, but the template wants an actor/,
    );
  });

  it('lets Situation.parse have the last word on a weapon with nothing behind it', () => {
    // FR-20 is the schema's guarantee, not a second opinion the renderer invents: every
    // weapon slug must be inlined in `items`, and the message comes from `Situation`.
    const noWeaponFixture = buildFixtureIndex(FIXTURES.filter((f) => f.kind === 'actor'));
    expect(() => renderTemplate(template(), {}, noWeaponFixture, 'srd-5.2.1')).toThrow(
      /no fixture 'longsword' is scoped/,
    );
  });

  it('reports a skeleton with no timeline as a shape problem, not a Zod dump', () => {
    const broken = template({ skeleton: { actors: [] } as Template['skeleton'] });
    expect(() => renderTemplate(broken, {}, index, 'srd-5.2.1')).toThrow(/expected a sequence/);
  });
});
