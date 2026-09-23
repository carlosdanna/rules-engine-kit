/**
 * Shapes used by the schema tests. These are *not* content: the numbers are placeholders
 * chosen to exercise validation, not SRD stat blocks, and nothing here is seeded. Real
 * fixtures live in `content/` and are checked against the SRD (see `CONTRIBUTING.md`).
 */

import type {
  Outcome,
  ResolvedProfile,
  Rule,
  RulesetVersion,
  Situation,
  Trace,
  TraceEvent,
} from '../../src/index';
import { ENGINE_VERSION, SITUATION_SCHEMA_VERSION, TRACE_SCHEMA_VERSION } from '../../src/index';

export const ATTACK_ROLL_ID = 'r1-fighter/attack:fighter';

/** A fighter attacking a prone goblin in melee, over a single round. */
export const situation: Situation = {
  schemaVersion: SITUATION_SCHEMA_VERSION,
  items: {
    longsword: {
      slug: 'longsword',
      name: 'Longsword',
      damage: { dice: { count: 1, sides: 8 }, type: 'slashing' },
      properties: ['versatile'],
      mastery: 'sap',
    },
  },
  actors: [
    {
      id: 'fighter',
      name: 'Fighter',
      abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 },
      proficiencyBonus: 2,
      ac: 16,
      hp: 28,
      hpCurrent: 28,
      conditions: [],
      resistances: [],
      vulnerabilities: [],
    },
    {
      id: 'goblin',
      name: 'Goblin',
      abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
      proficiencyBonus: 2,
      ac: 15,
      hp: 7,
      hpCurrent: 7,
      conditions: ['prone'],
      resistances: [],
      vulnerabilities: [],
    },
  ],
  timeline: [
    {
      id: 'r1-fighter',
      round: 1,
      actorId: 'fighter',
      action: {
        type: 'attack',
        mode: 'melee',
        targetId: 'goblin',
        weapon: 'longsword',
        rangeFt: 5,
      },
    },
    { id: 'r1-goblin', round: 1, actorId: 'goblin', action: null },
  ],
  intents: {
    useInspiration: true,
    rollChoices: { [ATTACK_ROLL_ID]: { rerollDieIndex: 1 } },
  },
};

/** Melee attacks against a prone creature have advantage — identical wording in both SRDs. */
export const rule: Rule = {
  key: 'condition.prone.attacked-within-5ft',
  phase: 'modifiers',
  priority: 100,
  label: 'Prone: attacked within 5 feet',
  description:
    'An attack roll against a prone creature has advantage if the attacker is within 5 feet.',
  tags: ['condition', 'prone'],
  condition: {
    all: [
      { '==': [{ var: 'step.action.type' }, 'attack'] },
      { in: ['prone', { var: 'target.conditions' }] },
      { '<=': [{ var: 'action.rangeFt' }, 5] },
    ],
  },
  effects: [{ type: 'rollMode', target: { kind: 'attack', actor: '$actor' }, mode: 'advantage' }],
  citation: { source: 'srd-5.2.1', section: 'Rules Glossary > Prone [Condition]' },
  interpretation: null,
};

export const rulesetVersion: RulesetVersion = {
  id: 'dnd5e-srd',
  version: '5.2.1',
  name: 'SRD 5.2.1',
  kind: 'base',
  extends: null,
  author: 'Wizards of the Coast LLC',
  license: 'CC-BY-4.0',
  sourceUrl: 'https://www.dndbeyond.com/srd',
  attribution: 'This work includes material from the System Reference Document 5.2.1.',
  facts: [
    {
      path: 'target.conditions',
      type: 'stringList',
      description: 'Conditions on the target',
      derived: false,
      nullable: false,
    },
    {
      path: 'roll.attack.bonus',
      type: 'number',
      description: 'Assembled attack bonus',
      derived: true,
      nullable: false,
    },
  ],
  rules: [{ op: 'add', ...rule }],
};

export const resolvedProfile: ResolvedProfile = {
  rules: [
    {
      ...rule,
      enabled: true,
      provenance: [{ layer: 'dnd5e-srd', version: '5.2.1', op: 'add' }],
    },
  ],
  hash: 'sha256:0000000000000000',
  sources: [{ layer: 'dnd5e-srd', version: '5.2.1' }],
  conflicts: [],
};

export const rollEvent: TraceEvent = {
  seq: 1,
  stepId: 'r1-fighter',
  round: 1,
  phase: 'roll',
  kind: 'roll',
  rollId: ATTACK_ROLL_ID,
  target: { kind: 'attack', actorId: 'fighter' },
  mode: 'advantage',
  modeInputs: [{ ruleKey: 'condition.prone.attacked-within-5ft', mode: 'advantage' }],
  dice: [4, 16],
  transforms: [
    { ruleKey: 'inspiration.spend', kind: 'reroll', dieIndex: 0, from: 4, to: 11, clamped: false },
  ],
  diceAfterTransforms: [11, 16],
  kept: 16,
  keptIndex: 1,
  forced: true,
  modifiers: [
    {
      ruleKey: 'attack.ability-modifier',
      modifierType: 'ability',
      policy: 'sum',
      value: 3,
    },
    {
      ruleKey: 'attack.proficiency',
      modifierType: 'proficiency',
      stackKey: 'proficiency',
      policy: 'unique',
      value: 2,
    },
  ],
  dropped: [],
  total: 21,
};

export const trace: Trace = {
  traceSchemaVersion: TRACE_SCHEMA_VERSION,
  events: [
    {
      seq: 0,
      stepId: 'r1-fighter',
      round: 1,
      phase: 'modifiers',
      kind: 'rule',
      ruleKey: 'condition.prone.attacked-within-5ft',
      status: 'fired',
      conditionResult: true,
      factsRead: [
        { path: 'step.action.type', value: 'attack' },
        { path: 'target.conditions', value: ['prone'] },
        { path: 'action.rangeFt', value: 5 },
      ],
      deltas: [],
      citation: { source: 'srd-5.2.1', section: 'Rules Glossary > Prone [Condition]' },
      provenance: { layer: 'dnd5e-srd', version: '5.2.1', op: 'add' },
    },
    rollEvent,
    {
      seq: 2,
      stepId: 'r1-fighter',
      round: 1,
      phase: 'compare',
      kind: 'compare',
      rollId: ATTACK_ROLL_ID,
      target: { kind: 'attack', actorId: 'fighter' },
      total: 21,
      dc: 15,
      result: 'hit',
    },
  ],
};

export const outcome: Outcome = {
  steps: [
    {
      stepId: 'r1-fighter',
      round: 1,
      actorId: 'fighter',
      rolls: [
        {
          rollId: ATTACK_ROLL_ID,
          target: { kind: 'attack', actorId: 'fighter' },
          mode: 'advantage',
          kept: 16,
          modifiers: rollEvent.kind === 'roll' ? rollEvent.modifiers : [],
          total: 21,
          forced: true,
        },
      ],
      comparisons: [
        {
          rollId: ATTACK_ROLL_ID,
          target: { kind: 'attack', actorId: 'fighter' },
          total: 21,
          dc: 15,
          result: 'hit',
        },
      ],
      damage: [{ actorId: 'goblin', damageType: 'slashing', amount: 7, hpAfter: 0, overflow: 0 }],
      halted: null,
    },
  ],
  finalState: {
    actors: {
      fighter: { id: 'fighter', hpCurrent: 28, conditions: [] },
      goblin: { id: 'goblin', hpCurrent: 0, conditions: ['prone'] },
    },
    activeEffects: [],
  },
  derived: [
    {
      path: 'roll.attack.bonus',
      actorId: 'fighter',
      stepId: 'r1-fighter',
      base: 0,
      terms: [
        {
          source: 'ability',
          ruleKey: 'attack.ability-modifier',
          value: 3,
          modifierType: 'ability',
        },
        {
          source: 'proficiency',
          ruleKey: 'attack.proficiency',
          value: 2,
          modifierType: 'proficiency',
        },
      ],
      total: 5,
    },
  ],
  events: [],
  seed: 'demo-seed',
  profileHash: 'sha256:0000000000000000',
  engineVersion: ENGINE_VERSION,
  traceSchemaVersion: TRACE_SCHEMA_VERSION,
};
