/**
 * The template schema's contract is `docs/content-authoring.md` § Template, so the example
 * in that document is the first test case.
 *
 * `skeleton` is deliberately only checked to be JSON here. Its `{{param}}` and
 * `$rollId(attack)` placeholders mean something to `renderTemplate`, which does not exist
 * yet (Q24 in `docs/open-questions.md`), and a schema that half-understood them would be a
 * second answer to what they mean.
 */

import { describe, expect, it } from 'vitest';
import { TEMPLATE_SCHEMA_VERSION, Template } from '../../src/schema';

const MELEE_ATTACK = {
  id: 'melee-attack',
  name: 'Melee attack',
  description: 'One creature swings at another, once.',
  tags: ['combat', 'attack'],
  schemaVersion: TEMPLATE_SCHEMA_VERSION,
  suggestedProfiles: ['srd-5.1', 'srd-5.2.1'],
  params: {
    attacker: { type: 'fixture', kind: 'actor', default: 'fighter-3' },
    target: { type: 'fixture', kind: 'actor', default: 'goblin' },
    weapon: { type: 'fixture', kind: 'item', default: 'longsword' },
    targetConditions: { type: 'conditionList', default: [] },
    useInspiration: { type: 'boolean', default: false },
    rerollDie: { type: 'rollChoice', roll: 'attack', choice: 'rerollDieIndex', default: 0 },
  },
  skeleton: {
    action: { type: 'attack', mode: 'melee', weapon: '{{weapon}}' },
    actors: ['{{attacker}}', { ref: '{{target}}', conditions: '{{targetConditions}}' }],
    intents: {
      rollChoices: { '{{$rollId(attack)}}': { rerollDieIndex: '{{rerollDie}}' } },
    },
  },
};

describe('the documented template', () => {
  it('parses', () => {
    expect(Template.parse(MELEE_ATTACK)).toEqual(MELEE_ATTACK);
  });

  it('is versioned, so a saved scenario can be migrated (VR-8)', () => {
    expect(() =>
      Template.parse({ ...MELEE_ATTACK, schemaVersion: TEMPLATE_SCHEMA_VERSION + 1 }),
    ).toThrow();
  });

  it('needs at least one suggested profile: a template no profile runs is untestable (NFR-4)', () => {
    expect(() => Template.parse({ ...MELEE_ATTACK, suggestedProfiles: [] })).toThrow();
  });
});

describe('param types', () => {
  const withParam = (param: unknown) => ({
    ...MELEE_ATTACK,
    params: { ...MELEE_ATTACK.params, extra: param },
  });

  it('accepts a number param with bounds', () => {
    expect(() =>
      Template.parse(withParam({ type: 'number', default: 5, min: 0, max: 10 })),
    ).not.toThrow();
  });

  it('accepts an enum param whose default is one of its values', () => {
    expect(() =>
      Template.parse(withParam({ type: 'enum', values: ['melee', 'ranged'], default: 'melee' })),
    ).not.toThrow();
  });

  it('rejects an enum param whose default is not one of its values', () => {
    expect(() =>
      Template.parse(withParam({ type: 'enum', values: ['melee', 'ranged'], default: 'thrown' })),
    ).toThrow(/default/);
  });

  it('rejects an enum param with no values', () => {
    expect(() => Template.parse(withParam({ type: 'enum', values: [], default: 'x' }))).toThrow();
  });

  it('rejects a param type the document does not list', () => {
    expect(() => Template.parse(withParam({ type: 'situation', default: {} }))).toThrow();
  });

  it('rejects a fixture param with no kind: the UI picks from one list or the other (FR-19)', () => {
    expect(() => Template.parse(withParam({ type: 'fixture', default: 'goblin' }))).toThrow();
  });

  it('rejects a rollChoice naming a choice the situation schema has no field for', () => {
    expect(() =>
      Template.parse(
        withParam({ type: 'rollChoice', roll: 'attack', choice: 'keepHigher', default: 0 }),
      ),
    ).toThrow();
  });

  it('rejects a rollChoice on a roll kind that is not a roll target (ADR-0014)', () => {
    expect(() =>
      Template.parse(
        withParam({ type: 'rollChoice', roll: 'upkeep', choice: 'rerollDieIndex', default: 0 }),
      ),
    ).toThrow();
  });
});
