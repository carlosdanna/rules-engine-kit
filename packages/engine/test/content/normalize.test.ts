/**
 * The normaliser's contract is `docs/content-authoring.md`, so the examples in that document
 * are the test cases. If one of them stops normalising, either the doc is lying to an author
 * or the loader has drifted from it — and the point of this file is that it cannot be both
 * for long.
 */

import { describe, expect, it } from 'vitest';
import {
  ContentNormalizeError,
  normalizeFactsFile,
  normalizeFixture,
  normalizePack,
  normalizePackManifest,
  normalizeRuleFile,
  normalizeTemplate,
} from '../../src/content';
import { TEMPLATE_SCHEMA_VERSION } from '../../src/schema';

const PACK = {
  id: 'dnd5e-srd',
  version: '5.2.1',
  name: 'SRD 5.2.1',
  kind: 'base',
  extends: null,
  author: 'Wizards of the Coast LLC',
  license: 'CC-BY-4.0',
  sourceUrl: 'https://www.dndbeyond.com/srd',
  attribution: 'This work includes material from the System Reference Document 5.2.1.',
};

const FACTS = [
  { path: 'actor.surprised', type: 'boolean', description: 'is the actor surprised' },
  { path: 'action.type', type: 'string', description: 'the declared action kind' },
];

const CITATION = { source: 'srd-5.2.1', section: 'Rules Glossary > Surprise' };

function pack(rules: unknown[], facts: unknown = FACTS) {
  return normalizePack({ pack: PACK, facts, rules });
}

/** Exactly the rule from `content-authoring.md`, `op` changed so it needs no base to override. */
const DOC_RULE = {
  key: 'combat.surprise',
  op: 'add',
  phase: 'modifiers',
  priority: 100,
  description: 'Surprised creatures roll initiative with disadvantage.',
  condition: { '==': [{ var: 'actor.surprised' }, true] },
  effects: [
    { type: 'rollMode', target: { kind: 'initiative', actor: '$actor' }, mode: 'disadvantage' },
  ],
  citation: CITATION,
  interpretation: null,
};

describe('normalizePack — the documented rule (content-authoring.md)', () => {
  it('accepts it as written, without label or tags', () => {
    expect(() => pack([DOC_RULE])).not.toThrow();
  });

  it("defaults label to the rule key, because that is what a rename's label started as", () => {
    expect(pack([DOC_RULE]).rules[0]).toMatchObject({ label: 'combat.surprise', tags: [] });
  });

  it('defaults op to add, so the common case needs no ceremony', () => {
    const { op, ...withoutOp } = DOC_RULE;
    expect(pack([withoutOp]).rules[0]).toMatchObject({ op: 'add' });
  });

  it('reads an omitted condition as "always applies once selected"', () => {
    const { condition, ...withoutCondition } = DOC_RULE;
    expect(pack([withoutCondition]).rules[0]).toMatchObject({ condition: null, priority: 100 });
  });

  it('leaves what the author did write alone', () => {
    const labelled = { ...DOC_RULE, label: 'Surprise', tags: ['combat'], priority: 7 };
    expect(pack([labelled]).rules[0]).toMatchObject({
      label: 'Surprise',
      tags: ['combat'],
      priority: 7,
    });
  });
});

describe('normalizePack — effect shorthands (ADR-0011, ADR-0012)', () => {
  const rule = (effects: unknown[]) => ({ ...DOC_RULE, condition: null, effects });

  it('expands { dice: 1d4 } into a structured DiceExpr', () => {
    const effects = [
      {
        type: 'addModifier',
        target: { kind: 'attack', actor: '$actor' },
        value: { dice: '1d4' },
        modifierType: 'bless',
        stackKey: 'bless',
        policy: 'unique',
      },
    ];
    expect(pack([rule(effects)]).rules[0]).toMatchObject({
      effects: [{ value: { count: 1, sides: 4 } }],
    });
  });

  it('leaves a flat numeric modifier as a number', () => {
    const effects = [
      {
        type: 'addModifier',
        target: { kind: 'attack', actor: '$actor' },
        value: 3,
        modifierType: 'ability',
        policy: 'sum',
      },
    ];
    expect(pack([rule(effects)]).rules[0]).toMatchObject({ effects: [{ value: 3 }] });
  });

  it('refuses dice notation carrying a flat bonus, which would bypass stacking (FR-11)', () => {
    const effects = [
      {
        type: 'addModifier',
        target: { kind: 'attack', actor: '$actor' },
        value: { dice: '1d4+2' },
        modifierType: 'bless',
        policy: 'unique',
      },
    ];
    expect(() => pack([rule(effects)])).toThrow(ContentNormalizeError);
    expect(() => pack([rule(effects)])).toThrow(/addModifier effect/);
  });

  it('tags a bare dieSelector: intent', () => {
    const effects = [
      {
        type: 'rollTransform',
        target: { kind: 'attack', actor: '$actor' },
        transform: { kind: 'reroll', keep: 'new' },
        uses: 1,
        dieSelector: 'intent',
      },
    ];
    expect(pack([rule(effects)]).rules[0]).toMatchObject({
      effects: [{ dieSelector: { kind: 'intent' } }],
    });
  });

  it('tags { fixed: 2 } as a fixed selector', () => {
    const effects = [
      {
        type: 'rollTransform',
        target: { kind: 'attack', actor: '$actor' },
        transform: { kind: 'minimumDie', value: 10 },
        uses: 1,
        dieSelector: { fixed: 2 },
      },
    ];
    expect(pack([rule(effects)]).rules[0]).toMatchObject({
      effects: [{ dieSelector: { kind: 'fixed', index: 2 } }],
    });
  });

  it('names an unknown selector rather than passing it to Zod', () => {
    const effects = [
      {
        type: 'rollTransform',
        target: { kind: 'attack', actor: '$actor' },
        transform: { kind: 'reroll', keep: 'new' },
        uses: 1,
        dieSelector: 'lowest',
      },
    ];
    expect(() => pack([rule(effects)])).toThrow(/'lowest' is not a die selector/);
  });

  it('tags the documented Bless duration', () => {
    const effects = [
      {
        type: 'applyCondition',
        actor: '$target',
        condition: 'blessed',
        duration: { kind: 'rounds', rounds: 10, anchor: 'source', edge: 'end' },
      },
    ];
    expect(pack([rule(effects)]).rules[0]).toMatchObject({
      effects: [{ duration: { anchor: { kind: 'source' } } }],
    });
  });

  it('reads any other anchor string as an explicit actor id', () => {
    const effects = [
      {
        type: 'applyCondition',
        actor: '$target',
        condition: 'blessed',
        duration: { kind: 'untilTurn', anchor: 'cleric', edge: 'start', afterRounds: 0 },
      },
    ];
    expect(pack([rule(effects)]).rules[0]).toMatchObject({
      effects: [{ duration: { anchor: { kind: 'actor', actorId: 'cleric' } } }],
    });
  });

  it('expands a bare dice expression on rollDice', () => {
    const effects = [{ type: 'rollDice', expr: '2d6', into: 'scratch.damage' }];
    expect(pack([rule(effects)]).rules[0]).toMatchObject({
      effects: [{ expr: { count: 2, sides: 6 } }],
    });
  });
});

describe('normalizePack — entries with no rule body (ADR-0009)', () => {
  it('leaves a patch alone rather than filling in fields it may not carry', () => {
    const entry = { op: 'patch', key: 'combat.surprise', priority: 5 };
    expect(pack([DOC_RULE, entry]).rules[1]).toEqual(entry);
  });

  it('defaults a disable reason to null', () => {
    expect(pack([DOC_RULE, { op: 'disable', key: 'combat.surprise' }]).rules[1]).toEqual({
      op: 'disable',
      key: 'combat.surprise',
      reason: null,
    });
  });
});

describe('normalizePack — facts.yaml', () => {
  it('reads a bare sequence', () => {
    expect(pack([DOC_RULE]).facts).toHaveLength(2);
  });

  it('reads a mapping with a facts key too', () => {
    expect(pack([DOC_RULE], { facts: FACTS }).facts).toHaveLength(2);
  });

  it('defaults derived to false, the common case', () => {
    expect(pack([DOC_RULE]).facts[0]).toMatchObject({ derived: false, nullable: false });
  });

  it('keeps an explicit derived: true', () => {
    const derived = [
      {
        path: 'actor.ac.effective',
        type: 'number',
        description: 'AC',
        derived: true,
        nullable: false,
      },
    ];
    expect(pack([DOC_RULE], derived).facts[0]).toMatchObject({ derived: true, nullable: false });
  });
});

describe('normalizePack — failures name a place in the document', () => {
  it('points at the rule index when a rule is not a mapping', () => {
    expect(() => pack([DOC_RULE, 'oops'])).toThrow(/^rules\[1\]: expected a mapping/);
  });

  it('points at the effect when an effect is not a mapping', () => {
    expect(() => pack([{ ...DOC_RULE, effects: ['oops'] }])).toThrow(
      /^rules\[0\]\.effects\[0\]: expected a mapping/,
    );
  });

  it('says which rule has no key', () => {
    const { key, ...keyless } = DOC_RULE;
    expect(() => pack([keyless])).toThrow(/^rules\[0\]\.key: every rule needs a key/);
  });

  it('still validates against the schema after normalising', () => {
    expect(() => pack([{ ...DOC_RULE, phase: 'initiative' }])).toThrow();
  });
});

/**
 * The per-document entry points exist so `content:lint` can name the *file* a mistake is
 * in. `normalizePack` assembles three documents and then parses, so its Zod errors point
 * at `rules[3]` — an index into an object nobody can open.
 */
describe('per-document entry points (content:lint)', () => {
  it('parses pack.yaml on its own', () => {
    expect(normalizePackManifest(PACK)).toEqual(PACK);
  });

  it('defaults an omitted extends to null on a base', () => {
    const { extends: _extends, ...withoutExtends } = PACK;
    expect(normalizePackManifest(withoutExtends)).toMatchObject({ extends: null });
  });

  it('still refuses a layer that names no base (VR-3)', () => {
    expect(() => normalizePackManifest({ ...PACK, kind: 'layer' })).toThrow();
  });

  it('parses facts.yaml on its own, applying the derived default', () => {
    expect(normalizeFactsFile(FACTS)).toEqual([
      { ...FACTS[0], derived: false, nullable: false },
      { ...FACTS[1], derived: false, nullable: false },
    ]);
  });

  it('parses one rule file, with the same defaults normalizePack applies', () => {
    const { op, ...withoutOp } = DOC_RULE;
    expect(normalizeRuleFile(withoutOp, 'rules/surprise.yaml')).toMatchObject({
      op: 'add',
      label: 'combat.surprise',
      tags: [],
      priority: 100,
    });
  });

  it('names the file rather than an index when a rule file is wrong', () => {
    expect(() => normalizeRuleFile({ ...DOC_RULE, key: undefined }, 'rules/surprise.yaml')).toThrow(
      /^rules\/surprise\.yaml\.key: every rule needs a key/,
    );
  });

  it('normalises a rule file and normalizePack to the same entry', () => {
    expect(normalizeRuleFile(DOC_RULE, 'rules/surprise.yaml')).toEqual(pack([DOC_RULE]).rules[0]);
  });
});

describe('normalizeFixture — the documented fixtures (content-authoring.md)', () => {
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
    },
    citation: { source: 'srd-5.2.1', section: 'Monsters > Goblin' },
  };

  const LONGSWORD = {
    slug: 'longsword',
    kind: 'item',
    rulesetScope: ['srd-5.1', 'srd-5.2.1'],
    data: {
      name: 'Longsword',
      damage: { dice: '1d8', type: 'slashing' },
      properties: ['versatile'],
      mastery: 'sap',
    },
    citation: { source: 'srd-5.2.1', section: 'Equipment > Weapons' },
  };

  it('accepts the actor fixture as written, defaulting its two damage lists', () => {
    expect(normalizeFixture(GOBLIN, 'fixtures/goblin.yaml')).toEqual({
      ...GOBLIN,
      data: { ...GOBLIN.data, resistances: [], vulnerabilities: [] },
      interpretation: null,
    });
  });

  it('defaults `interpretation` to null, like a rule`s (ADR-0026)', () => {
    const derived = { ...GOBLIN, interpretation: 'derived from the Fighter class tables' };
    expect(normalizeFixture(GOBLIN, 'fixtures/goblin.yaml')).toMatchObject({
      interpretation: null,
    });
    expect(normalizeFixture(derived, 'fixtures/fighter-3.yaml')).toMatchObject({
      interpretation: 'derived from the Fighter class tables',
    });
  });

  it('keeps an actor`s resistances and vulnerabilities when the stat block prints them', () => {
    const shrub = {
      ...GOBLIN,
      slug: 'awakened-shrub',
      data: { ...GOBLIN.data, resistances: ['piercing'], vulnerabilities: ['fire'] },
    };
    expect(normalizeFixture(shrub, 'fixtures/awakened-shrub.yaml')).toMatchObject({
      data: { resistances: ['piercing'], vulnerabilities: ['fire'] },
    });
  });

  it('turns an item fixture`s damage notation into a DiceExpr', () => {
    expect(normalizeFixture(LONGSWORD, 'fixtures/longsword.yaml')).toMatchObject({
      data: { damage: { dice: { count: 1, sides: 8 }, type: 'slashing' } },
    });
  });

  it('defaults an item to no damage, no properties and no mastery', () => {
    const shield = { ...LONGSWORD, slug: 'shield', data: { name: 'Shield' } };
    expect(normalizeFixture(shield, 'fixtures/shield.yaml')).toMatchObject({
      data: { name: 'Shield', damage: null, properties: [], mastery: null },
    });
  });

  it('refuses damage notation carrying a flat bonus, for the reason a rule`s does (FR-11)', () => {
    const bad = { ...LONGSWORD, data: { ...LONGSWORD.data, damage: { dice: '1d8+2', type: 'x' } } };
    expect(() => normalizeFixture(bad, 'fixtures/longsword.yaml')).toThrow(ContentNormalizeError);
  });

  it('names the file when a fixture is not a mapping', () => {
    expect(() => normalizeFixture('oops', 'fixtures/goblin.yaml')).toThrow(
      /^fixtures\/goblin\.yaml: expected a mapping/,
    );
  });
});

describe('normalizeTemplate', () => {
  const TEMPLATE = {
    id: 'melee-attack',
    name: 'Melee attack',
    description: 'One creature swings at another, once.',
    schemaVersion: TEMPLATE_SCHEMA_VERSION,
    suggestedProfiles: ['srd-5.2.1'],
    params: { useInspiration: { type: 'boolean', default: false } },
    skeleton: { action: { type: 'attack', mode: 'melee', weapon: '{{weapon}}' } },
  };

  it('defaults tags to empty, the one field a template rarely varies', () => {
    expect(normalizeTemplate(TEMPLATE, 'templates/melee-attack.yaml')).toMatchObject({ tags: [] });
  });

  it('names the file when a template is not a mapping', () => {
    expect(() => normalizeTemplate([], 'templates/melee-attack.yaml')).toThrow(
      /^templates\/melee-attack\.yaml: expected a mapping/,
    );
  });
});
