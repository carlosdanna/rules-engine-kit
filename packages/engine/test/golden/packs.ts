/**
 * Rule packs for the golden scenarios.
 *
 * These are **fixtures, not content**. Real packs live in `content/`, are authored in YAML
 * and are checked against the SRD before they are committed; these exist only to drive the
 * loop end to end and are deliberately the smallest thing that does so. The citations name
 * the sections the mechanics paraphrase, and the expected numbers in each golden test are
 * derived by hand from those sections, never from what the engine produced.
 */

import type {
  Citation,
  Condition,
  FactDefinition,
  Rule,
  RuleEntry,
  RulesetVersion,
} from '../../src/schema';

const SRD_52: Citation['source'] = 'srd-5.2.1';
const SRD_51: Citation['source'] = 'srd-5.1';

export const facts: FactDefinition[] = [
  { path: 'action.type', type: 'string', description: 'the declared action kind', derived: false },
  { path: 'action.rangeFt', type: 'number', description: 'distance to the target', derived: false },
  { path: 'action.mode', type: 'string', description: 'melee or ranged', derived: false },
  {
    path: 'actor.conditions',
    type: 'stringList',
    description: "the acting actor's conditions",
    derived: false,
  },
  {
    path: 'target.conditions',
    type: 'stringList',
    description: "the target's conditions",
    derived: false,
  },
  {
    path: 'actor.abilityMod.str',
    type: 'number',
    description: 'strength modifier',
    derived: false,
  },
  {
    path: 'actor.proficiencyBonus',
    type: 'number',
    description: 'proficiency bonus',
    derived: false,
  },
  {
    path: 'intents.useInspiration',
    type: 'boolean',
    description: 'declared up front (ADR-0003)',
    derived: false,
  },
  {
    path: 'actor.ac.effective',
    type: 'number',
    description: 'AC after cover and spells',
    derived: true,
  },
];

function rule(key: string, overrides: Partial<Rule> & { citation: Citation }): Rule {
  return {
    key,
    phase: 'modifiers',
    priority: 0,
    label: key,
    description: key,
    tags: [],
    condition: null,
    effects: [],
    interpretation: null,
    ...overrides,
  };
}

const add = (key: string, overrides: Partial<Rule> & { citation: Citation }): RuleEntry => ({
  op: 'add',
  ...rule(key, overrides),
});

const isAttack: Condition = { '==': [{ var: 'action.type' }, 'attack'] };

/** Ability modifier and proficiency on an attack roll. */
const attackBonuses: RuleEntry[] = [
  add('attack.ability-modifier', {
    priority: -20,
    condition: isAttack,
    effects: [
      {
        type: 'addModifier',
        target: { kind: 'attack', actor: '$actor' },
        value: 3,
        modifierType: 'ability',
        policy: 'sum',
      },
    ],
    citation: { source: SRD_52, section: 'Playing the Game > Attack Rolls' },
  }),
  add('attack.proficiency', {
    priority: -19,
    condition: isAttack,
    effects: [
      {
        type: 'addModifier',
        target: { kind: 'attack', actor: '$actor' },
        value: 2,
        modifierType: 'proficiency',
        // Proficiency applies once however many rules claim it.
        stackKey: 'proficiency',
        policy: 'unique',
      },
    ],
    citation: { source: SRD_52, section: 'Playing the Game > Proficiency Bonus' },
  }),
];

/**
 * Prone: an attack against a prone creature has advantage if the attacker is within 5 feet,
 * and disadvantage otherwise. Both SRDs agree.
 */
const prone: RuleEntry = add('condition.prone.attacked', {
  priority: -10,
  condition: {
    all: [
      isAttack,
      { in: ['prone', { var: 'target.conditions' }] },
      { '<=': [{ var: 'action.rangeFt' }, 5] },
    ],
  },
  effects: [{ type: 'rollMode', target: { kind: 'attack', actor: '$actor' }, mode: 'advantage' }],
  citation: { source: SRD_52, section: 'Rules Glossary > Prone [Condition]' },
});

/**
 * The 5.1-vs-5.2.1 contrast, on one shared rule key: 5.1's Inspiration grants advantage,
 * 5.2.1's Heroic Inspiration rerolls the die and you must use the new roll. One effect
 * swap, which is what the three-channel split (ADR-0011) buys.
 */
const heroicInspiration: RuleEntry = add('inspiration.spend', {
  priority: 0,
  condition: { all: [isAttack, { '==': [{ var: 'intents.useInspiration' }, true] }] },
  effects: [
    {
      type: 'rollTransform',
      target: { kind: 'attack', actor: '$actor' },
      transform: { kind: 'reroll', keep: 'new' },
      uses: 1,
      dieSelector: { kind: 'intent' },
    },
  ],
  citation: { source: SRD_52, section: 'Rules Glossary > Heroic Inspiration' },
  interpretation:
    '5.2.1 says you must use the new roll, so the reroll is not optional once declared.',
});

const inspiration51: RuleEntry = add('inspiration.spend', {
  priority: 0,
  condition: { all: [isAttack, { '==': [{ var: 'intents.useInspiration' }, true] }] },
  effects: [{ type: 'rollMode', target: { kind: 'attack', actor: '$actor' }, mode: 'advantage' }],
  citation: { source: SRD_51, section: 'Using Ability Scores > Inspiration' },
});

/** Bless: the caster grants the condition; a blessed creature adds 1d4 to its attack rolls. */
const bless: RuleEntry[] = [
  add('spell.bless.cast', {
    phase: 'apply',
    priority: 0,
    condition: { '==': [{ var: 'action.type' }, 'cast'] },
    effects: [
      {
        type: 'applyCondition',
        actor: '$target',
        condition: 'blessed',
        // 1 minute is 10 rounds, ending at the end of the caster's turn.
        duration: { kind: 'rounds', rounds: 10, anchor: { kind: 'source' }, edge: 'end' },
      },
    ],
    citation: { source: SRD_52, section: 'Spell Descriptions > Bless' },
    interpretation:
      'Neither SRD states which edge a 1-minute duration ends on; this reads it as the end of the caster’s turn in round applied + 10. Concentration is not simulated (ADR-0003).',
  }),
  add('spell.bless.attack-bonus', {
    priority: 0,
    condition: { all: [isAttack, { in: ['blessed', { var: 'actor.conditions' }] }] },
    effects: [
      {
        type: 'addModifier',
        target: { kind: 'attack', actor: '$actor' },
        value: { count: 1, sides: 4 },
        modifierType: 'bless',
        stackKey: 'bless',
        policy: 'unique',
      },
    ],
    citation: { source: SRD_52, section: 'Spell Descriptions > Bless' },
  }),
];

function pack(id: string, version: string, rules: RuleEntry[], source: string): RulesetVersion {
  return {
    id,
    version,
    name: `${source} (test fixture)`,
    kind: 'base',
    extends: null,
    license: 'CC-BY-4.0',
    sourceUrl: 'https://www.dndbeyond.com/srd',
    attribution: source,
    facts,
    rules,
  };
}

export const srd521 = pack(
  'dnd5e-srd',
  '5.2.1',
  [...attackBonuses, prone, heroicInspiration, ...bless],
  'SRD 5.2.1',
);

export const srd51 = pack(
  'dnd5e-srd',
  '5.1.0',
  [...attackBonuses, prone, inspiration51, ...bless],
  'SRD 5.1',
);
