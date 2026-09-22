import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/evaluator';
import { resolveProfile } from '../../src/resolver';
import { type Actor, SITUATION_SCHEMA_VERSION, type Situation } from '../../src/schema';
import { explain, narrateTrace, narrativeContextFromSituation } from '../../src/trace';
import { facts, srd51, srd521 } from './packs';

const p521 = resolveProfile([srd521]);
const p51 = resolveProfile([srd51]);

function actor(id: string, overrides: Partial<Actor> = {}): Actor {
  return {
    id,
    name: `${id[0]?.toUpperCase()}${id.slice(1)}`,
    abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 },
    proficiencyBonus: 2,
    ac: 15,
    hp: 30,
    hpCurrent: 30,
    conditions: [],
    ...overrides,
  };
}

const ATTACK: 'r1-fighter/attack:fighter' = 'r1-fighter/attack:fighter';

function situation(options: {
  targetAc: number;
  targetConditions?: string[];
  useInspiration: boolean;
  rangeFt?: number;
}): Situation {
  return {
    schemaVersion: SITUATION_SCHEMA_VERSION,
    items: {},
    actors: [
      actor('fighter'),
      actor('goblin', { ac: options.targetAc, conditions: options.targetConditions ?? [] }),
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
          weapon: null,
          rangeFt: options.rangeFt ?? 5,
        },
      },
    ],
    intents: {
      useInspiration: options.useInspiration,
      // ADR-0003: which die a reroll touches is declared up front, never asked for mid-run.
      rollChoices: { [ATTACK]: { rerollDieIndex: 0 } },
    },
  };
}

describe('golden — a reroll on one die of an advantage pair (ADR-0011)', () => {
  /*
   * Hand-derived from the table in ADR-0011 and docs/spike-notes.md §2.1.
   *
   * SRD 5.2.1, Rules Glossary > Prone: an attack against a prone creature has advantage if
   * the attacker is within 5 feet. Two d20s, forced to 4 and 16.
   * SRD 5.2.1, Rules Glossary > Heroic Inspiration: reroll the die and use the new roll. The
   * player declared die 0, which is the 4, and it rerolls to 11.
   *
   * Transforms act on the *pool*, before the keep (ADR-0011): pool (4, 16) becomes (11, 16),
   * advantage keeps 16, and 16 + 3 strength + 2 proficiency = 21 against AC 20 is a hit.
   * Under the superseded ADR-0008 order the reroll would have replaced the kept 16 with 11,
   * giving 16 and a miss — which is why the ordering is observable and worth a golden.
   */
  const run = () =>
    evaluate(situation({ targetAc: 20, targetConditions: ['prone'], useInspiration: true }), p521, {
      seed: 'demo-seed',
      facts,
      forcedRolls: { [ATTACK]: [4, 16], [`${ATTACK}:reroll`]: [11] },
    });

  it('rolls two dice under advantage and rerolls the declared one into the pool', () => {
    const roll = run().outcome.steps[0]?.rolls[0];
    expect(roll).toMatchObject({ mode: 'advantage', kept: 16, total: 21, forced: true });
  });

  it('shows the pool before and after the transform, and which die it touched', () => {
    const event = run().trace.events.find((e) => e.kind === 'roll');
    expect(event?.kind === 'roll' && event.dice).toEqual([4, 16]);
    expect(event?.kind === 'roll' && event.diceAfterTransforms).toEqual([11, 16]);
    expect(event?.kind === 'roll' && event.transforms).toEqual([
      {
        ruleKey: 'inspiration.spend',
        kind: 'reroll',
        dieIndex: 0,
        from: 4,
        to: 11,
        clamped: false,
      },
    ]);
    expect(event?.kind === 'roll' && event.keptIndex).toBe(1);
  });

  it('adds +3 strength and +2 proficiency to the kept 16 for a total of 21', () => {
    const roll = run().outcome.steps[0]?.rolls[0];
    expect(roll?.modifiers.map((m) => [m.modifierType, m.value])).toEqual([
      ['ability', 3],
      ['proficiency', 2],
    ]);
  });

  it('hits AC 20 with 21', () => {
    expect(run().outcome.steps[0]?.comparisons[0]).toMatchObject({
      total: 21,
      dc: 20,
      result: 'hit',
    });
  });

  it('is deterministic for the same seed (NFR-1)', () => {
    expect(run()).toEqual(run());
  });

  it('narrates the run as prose (NFR-7)', () => {
    const { trace } = run();
    const narrative = narrateTrace(
      trace,
      narrativeContextFromSituation(
        situation({ targetAc: 20, targetConditions: ['prone'], useInspiration: true }),
      ),
    );
    expect(narrative).toContain('dice [4,16] → reroll die[0] 4→11 (inspiration.spend) → [11,16]');
    expect(narrative).toContain('kept 16 +3 ability +2 proficiency = 21');
    expect(narrative).toContain('[compare] 21 vs DC 20 → hit');
  });
});

describe('golden — one rule key, two editions (ADR-0011, docs/spike-notes.md §1)', () => {
  /*
   * The same attack under both editions, hand-derived from each SRD.
   *
   * SRD 5.1, Using Ability Scores > Inspiration: spending it grants advantage. Two dice,
   * forced to 15 and 4; advantage keeps 15; 15 + 3 + 2 = 20 against AC 15 is a hit.
   *
   * SRD 5.2.1, Rules Glossary > Heroic Inspiration: it rerolls instead. One die, forced to
   * 15, rerolled to 4, and "you must use the new roll" — so 4 + 3 + 2 = 9 is a miss.
   *
   * The target is not prone here, so the only difference is the one effect on
   * `inspiration.spend`. That is the whole point of splitting mode from transform.
   */
  const declared = situation({ targetAc: 15, useInspiration: true });

  it('5.1 keeps the higher of two d20s: 15 + 3 + 2 = 20 vs AC 15 -> hit', () => {
    const { outcome, trace } = evaluate(declared, p51, {
      seed: 'demo-seed',
      facts,
      forcedRolls: { [ATTACK]: [15, 4] },
    });
    const event = trace.events.find((e) => e.kind === 'roll');
    expect(event?.kind === 'roll' && event.mode).toBe('advantage');
    expect(event?.kind === 'roll' && event.transforms).toEqual([]);
    expect(outcome.steps[0]?.rolls[0]).toMatchObject({ kept: 15, total: 20 });
    expect(outcome.steps[0]?.comparisons[0]).toMatchObject({ result: 'hit' });
  });

  it('5.2.1 must use the rerolled die: 4 + 3 + 2 = 9 vs AC 15 -> miss', () => {
    const { outcome, trace } = evaluate(declared, p521, {
      seed: 'demo-seed',
      facts,
      forcedRolls: { [ATTACK]: [15], [`${ATTACK}:reroll`]: [4] },
    });
    const event = trace.events.find((e) => e.kind === 'roll');
    expect(event?.kind === 'roll' && event.mode).toBe('normal');
    expect(event?.kind === 'roll' && event.diceAfterTransforms).toEqual([4]);
    expect(outcome.steps[0]?.rolls[0]).toMatchObject({ kept: 4, total: 9 });
    expect(outcome.steps[0]?.comparisons[0]).toMatchObject({ result: 'miss' });
  });

  it('answers "why not" for the rule that did not fire, from the trace alone (FR-15)', () => {
    const notDeclared = situation({ targetAc: 15, useInspiration: false });
    const { trace } = evaluate(notDeclared, p521, { seed: 'demo-seed', facts });
    const explanation = explain(trace, 'inspiration.spend');
    expect(explanation.inProfile).toBe(true);
    expect(explanation.occurrences[0]).toMatchObject({ status: 'skipped' });
    expect(explanation.narrative).toContain('condition false at');
  });
});
