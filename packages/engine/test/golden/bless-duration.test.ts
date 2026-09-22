import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/evaluator';
import { resolveProfile } from '../../src/resolver';
import {
  type Actor,
  type RollId,
  SITUATION_SCHEMA_VERSION,
  type Situation,
  type Step,
} from '../../src/schema';
import { narrateTrace, narrativeContextFromSituation } from '../../src/trace';
import { facts, srd521 } from './packs';

const profile = resolveProfile([srd521]);
const ROUNDS = 12;

function actor(id: string, overrides: Partial<Actor> = {}): Actor {
  return {
    id,
    name: `${id[0]?.toUpperCase()}${id.slice(1)}`,
    abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 },
    proficiencyBonus: 2,
    ac: 15,
    hp: 60,
    hpCurrent: 60,
    conditions: [],
    ...overrides,
  };
}

/**
 * The cleric acts before the fighter in every round, which is what makes the expiry
 * observable: Bless is anchored to the *caster's* turn.
 */
function timeline(): Step[] {
  const steps: Step[] = [];
  for (let round = 1; round <= ROUNDS; round++) {
    steps.push({
      id: `r${round}-cleric`,
      round,
      actorId: 'cleric',
      action: round === 1 ? { type: 'cast', spell: 'bless', targetIds: ['fighter'] } : null,
    });
    steps.push({
      id: `r${round}-fighter`,
      round,
      actorId: 'fighter',
      action: { type: 'attack', mode: 'melee', targetId: 'goblin', weapon: null, rangeFt: 5 },
    });
  }
  return steps;
}

const situation: Situation = {
  schemaVersion: SITUATION_SCHEMA_VERSION,
  actors: [actor('cleric'), actor('fighter'), actor('goblin', { ac: 20, hp: 200, hpCurrent: 200 })],
  items: {},
  timeline: timeline(),
  // Declared even though it is false: `intents.useInspiration` is registered as a boolean,
  // so leaving it out makes it read `null` and the comparison throws rather than silently
  // treating the intent as unspent (ADR-0013). Choices are declared up front (ADR-0003).
  intents: { useInspiration: false },
};

/** Every d20 pinned to 12 and every Bless d4 to 3, so only the duration varies. */
function forcedRolls(): Record<RollId, number[]> {
  const forced: Record<RollId, number[]> = {};
  for (let round = 1; round <= ROUNDS; round++) {
    const attack = `r${round}-fighter/attack:fighter`;
    forced[attack] = [12];
    forced[`${attack}:bless`] = [3];
  }
  return forced;
}

const run = () =>
  evaluate(situation, profile, { seed: 'demo-seed', facts, forcedRolls: forcedRolls() });

describe('golden — Bless expires on the caster’s turn (ADR-0012)', () => {
  /*
   * Hand-derived from the SRD and ADR-0012 (docs/spike-notes.md §2.2).
   *
   * SRD 5.2.1, Bless: a blessed creature adds 1d4 to its attack rolls; the spell lasts one
   * minute. A minute is ten rounds, ending at the end of the caster's turn (the reading is
   * recorded in the rule's `interpretation`, since neither SRD states the edge).
   *
   * The cleric casts on round 1, so Bless expires at the end of the cleric's turn in round
   * 11 — step index 20 of a 24-step timeline. The cleric acts first in every round, so the
   * fighter loses Bless *before its own turn* in round 11. Correct, and surprising.
   *
   * Blessed:   12 + 3 strength + 2 proficiency + 3 bless = 20 vs AC 20 -> hit, rounds 1-10.
   * Unblessed: 12 + 3 + 2                                = 17 vs AC 20 -> miss, rounds 11-12.
   */
  const attacks = () => run().outcome.steps.filter((step) => step.actorId === 'fighter');

  it('hits with 20 while blessed, in rounds 1 to 10', () => {
    for (const step of attacks().slice(0, 10)) {
      expect(step.rolls[0]?.total).toBe(20);
      expect(step.comparisons[0]).toMatchObject({ dc: 20, result: 'hit' });
    }
  });

  it('misses with 17 once Bless has gone, in rounds 11 and 12', () => {
    for (const step of attacks().slice(10)) {
      expect(step.rolls[0]?.total).toBe(17);
      expect(step.comparisons[0]).toMatchObject({ dc: 20, result: 'miss' });
    }
  });

  it('shows the d4 behind the +3, rather than a bare modifier (ADR-0014)', () => {
    const blessed = attacks()[0]?.rolls[0]?.modifiers.find((m) => m.modifierType === 'bless');
    expect(blessed).toMatchObject({ value: 3, rolled: { expr: '1d4', dice: [3] } });
  });

  it('applies the effect once, with its end resolved the moment it lands', () => {
    const applied = run().trace.events.filter((event) => event.kind === 'effectApplied');
    expect(applied).toHaveLength(1);
    expect(applied[0]).toMatchObject({
      stepId: 'r1-cleric',
      sourceRuleKey: 'spell.bless.cast',
      onActorId: 'fighter',
      expiresAt: { kind: 'at', point: { round: 11, stepIndex: 20, edge: 'end' } },
    });
  });

  it("expires once, on the caster's step in round 11, not the fighter's", () => {
    const expiries = run().trace.events.filter((event) => event.kind === 'expiry');
    expect(expiries).toHaveLength(1);
    expect(expiries[0]).toMatchObject({
      stepId: 'r11-cleric',
      sourceRuleKey: 'spell.bless.cast',
      at: { round: 11, stepIndex: 20, edge: 'end' },
    });
  });

  it('leaves no active effect behind at the end of the run', () => {
    const { finalState } = run().outcome;
    expect(finalState.activeEffects).toEqual([]);
    expect(finalState.actors.fighter?.conditions).toEqual([]);
  });

  it('is deterministic for the same seed (NFR-1)', () => {
    expect(run()).toEqual(run());
  });

  it("narrates the expiry as the caster's turn (ADR-0012, NFR-7)", () => {
    const narrative = narrateTrace(run().trace, narrativeContextFromSituation(situation));
    expect(narrative).toContain(
      "[expire] spell.bless.cast ended at the end of Cleric's turn, round 11",
    );
  });
});
