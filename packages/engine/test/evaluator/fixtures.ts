/**
 * Minimal packs and situations for driving the whole loop. These are fixtures, not content:
 * real packs live in `content/` and are checked against the SRD.
 */

import type {
  Actor,
  FactDefinition,
  Item,
  Rule,
  RuleEntry,
  RulesetVersion,
  Situation,
  Step,
} from '../../src/schema';
import { SITUATION_SCHEMA_VERSION } from '../../src/schema';

export const BASE_ID = 'dnd5e-srd';
export const BASE_VERSION = '5.2.1';

export const facts: FactDefinition[] = [
  {
    path: 'actor.conditions',
    type: 'stringList',
    description: 'conditions on the acting actor',
    derived: false,
    nullable: false,
  },
  {
    path: 'target.conditions',
    type: 'stringList',
    description: "the target's conditions",
    derived: false,
    nullable: false,
  },
  {
    path: 'actor.abilityMod.str',
    type: 'number',
    description: 'strength modifier',
    derived: false,
    nullable: false,
  },
  {
    path: 'actor.proficiencyBonus',
    type: 'number',
    description: 'proficiency bonus',
    derived: false,
    nullable: false,
  },
  {
    path: 'action.type',
    type: 'string',
    description: 'the declared action kind',
    derived: false,
    nullable: false,
  },
  {
    path: 'action.rangeFt',
    type: 'number',
    description: 'distance to the target',
    derived: false,
    nullable: false,
  },
  {
    path: 'step.round',
    type: 'number',
    description: 'the round this step is in',
    derived: false,
    nullable: false,
  },
  {
    path: 'actor.ac.effective',
    type: 'number',
    description: 'effective AC',
    derived: true,
    nullable: false,
  },
  {
    path: 'scratch.note',
    type: 'number',
    description: 'scratch space for tests',
    derived: false,
    nullable: false,
  },
];

export function rule(key: string, overrides: Partial<Rule> = {}): Rule {
  return {
    key,
    phase: 'modifiers',
    priority: 0,
    label: key,
    description: key,
    tags: [],
    condition: null,
    effects: [],
    citation: { source: 'srd-5.2.1', section: 'Rules Glossary' },
    interpretation: null,
    ...overrides,
  };
}

export const add = (key: string, overrides: Partial<Rule> = {}): RuleEntry => ({
  op: 'add',
  ...rule(key, overrides),
});

export const disable = (key: string, reason: string | null = null): RuleEntry => ({
  op: 'disable',
  key,
  reason,
});

export function base(rules: RuleEntry[], overrides: Partial<RulesetVersion> = {}): RulesetVersion {
  return {
    id: BASE_ID,
    version: BASE_VERSION,
    name: 'SRD 5.2.1 (test fixture)',
    kind: 'base',
    extends: null,
    author: 'Wizards of the Coast LLC',
    license: 'CC-BY-4.0',
    sourceUrl: 'https://www.dndbeyond.com/srd',
    attribution: 'SRD 5.2.1',
    facts,
    rules,
    ...overrides,
  };
}

export function layer(rules: RuleEntry[], overrides: Partial<RulesetVersion> = {}): RulesetVersion {
  return base(rules, {
    id: 'house-rules',
    version: '1.0.0',
    name: 'House rules (test fixture)',
    kind: 'layer',
    extends: { id: BASE_ID, range: '^5.2.0' },
    ...overrides,
  });
}

export function actor(id: string, overrides: Partial<Actor> = {}): Actor {
  return {
    id,
    name: `${id[0]?.toUpperCase()}${id.slice(1)}`,
    abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 },
    proficiencyBonus: 2,
    ac: 15,
    hp: 30,
    hpCurrent: 30,
    conditions: [],
    resistances: [],
    vulnerabilities: [],
    ...overrides,
  };
}

export function attackStep(id: string, round: number, overrides: Partial<Step> = {}): Step {
  return {
    id,
    round,
    actorId: 'fighter',
    action: { type: 'attack', mode: 'melee', targetId: 'goblin', weapon: null, rangeFt: 5 },
    ...overrides,
  };
}

/** An inlined item fixture (ADR-0017). `mastery` is the 5.2.1-only field. */
export function longsword(overrides: Partial<Item> = {}): Item {
  return {
    slug: 'longsword',
    name: 'Longsword',
    damage: { dice: { count: 1, sides: 8 }, type: 'slashing' },
    properties: ['versatile'],
    mastery: 'sap',
    ...overrides,
  };
}

export function situation(overrides: Partial<Situation> = {}): Situation {
  return {
    schemaVersion: SITUATION_SCHEMA_VERSION,
    actors: [actor('fighter'), actor('goblin', { ac: 15 })],
    items: {},
    timeline: [attackStep('r1-fighter', 1)],
    intents: {},
    ...overrides,
  };
}
