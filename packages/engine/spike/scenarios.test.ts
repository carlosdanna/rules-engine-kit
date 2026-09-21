/**
 * SPIKE — throwaway. Three hard rules, with expectations hand-derived from the
 * SRD text (see docs/spike-notes.md for the quoted wording and the arithmetic).
 *
 * Run: pnpm --filter @rules-engine-kit/engine exec vitest run --config spike/vitest.config.ts
 */

import { describe, expect, it } from 'vitest';
import { houseFlanking, srd51, srd521 } from './content';
import { evaluate, resolveProfile } from './engine';
import type { Actor, Situation, Step, TraceEvent } from './model';

// Spike actors: invented, not SRD stat blocks. STR 16 => +3, PB +2 => attack +5.
const fighter = (conditions: string[] = []): Actor => ({
  id: 'fighter',
  abilities: { str: 16, dex: 12 },
  proficiencyBonus: 2,
  ac: 16,
  conditions,
});
const dummy = (ac: number, conditions: string[] = []): Actor => ({
  id: 'dummy',
  abilities: { str: 10, dex: 10 },
  proficiencyBonus: 2,
  ac,
  conditions,
});
const cleric = (): Actor => ({
  id: 'cleric',
  abilities: { str: 10, dex: 10 },
  proficiencyBonus: 2,
  ac: 18,
  conditions: [],
});

const attackStep = (id: string, round: number, rangeFt = 5): Step => ({
  id,
  round,
  actorId: 'fighter',
  action: { type: 'attack', mode: rangeFt <= 5 ? 'melee' : 'ranged', targetId: 'dummy', rangeFt },
});

const p51 = resolveProfile([srd51]);
const p521 = resolveProfile([srd521]);

const rolls = (t: TraceEvent[]) => t.filter((e) => e.kind === 'roll');

// ───────────────────────────────────────────────────────────────────────────
describe('1. Inspiration (5.1, advantage) vs Heroic Inspiration (5.2.1, reroll)', () => {
  const situation = (): Situation => ({
    actors: [fighter(['inspired']), dummy(15)],
    timeline: [attackStep('s1', 1)],
    intents: { useInspiration: true },
  });

  // SRD 5.1: "Spending your inspiration gives you advantage on that roll."
  // SRD 5.2.1: "expend it to reroll any die immediately after rolling it, and
  //             you must use the new roll."
  // Same rule_key, same forced dice, opposite outcome.
  const forced = {
    's1/attack:fighter': [15, 4],
    's1/attack:fighter:reroll': [4],
  };

  it('5.1 keeps the higher of two d20s: 15 + 3 + 2 = 20 vs AC 15 -> hit', () => {
    const { outcome, trace } = evaluate(situation(), p51, { seed: 'spike', forcedRolls: forced });
    const r = rolls(trace.events)[0];
    expect(r?.mode).toBe('advantage');
    expect(r?.dice).toEqual([15, 4]);
    expect(r?.transforms).toEqual([]);
    expect(outcome.steps[0]?.attack).toMatchObject({ kept: 15, total: 20, result: 'hit' });
  });

  it('5.2.1 must keep the new roll: 15 rerolled to 4, 4 + 3 + 2 = 9 vs AC 15 -> miss', () => {
    const { outcome, trace } = evaluate(situation(), p521, { seed: 'spike', forcedRolls: forced });
    const r = rolls(trace.events)[0];
    expect(r?.mode).toBe('normal');
    expect(r?.dice).toEqual([15]);
    expect(r?.transforms).toMatchObject([
      { ruleKey: 'inspiration.spend', kind: 'reroll', from: 15, to: 4 },
    ]);
    expect(outcome.steps[0]?.attack).toMatchObject({ kept: 4, total: 9, result: 'miss' });
  });

  it('the same rule_key resolves to a different effect channel per edition', () => {
    const k = (p: typeof p51) => p.find((r) => r.key === 'inspiration.spend');
    expect(k(p51)?.label).toBe('Spend inspiration for advantage');
    expect(k(p521)?.label).toBe('Expend Heroic Inspiration to reroll the die');
    expect(k(p51)?.citation.source).toBe('srd-5.1');
    expect(k(p521)?.citation.source).toBe('srd-5.2.1');
  });

  it('crossed dice make both editions hit: (4,15) -> 15 either way', () => {
    const f = { 's1/attack:fighter': [4, 15], 's1/attack:fighter:reroll': [15] };
    const a = evaluate(situation(), p51, { seed: 'spike', forcedRolls: f });
    const b = evaluate(situation(), p521, { seed: 'spike', forcedRolls: f });
    expect(a.outcome.steps[0]?.attack).toMatchObject({ kept: 15, total: 20, result: 'hit' });
    expect(b.outcome.steps[0]?.attack).toMatchObject({ kept: 15, total: 20, result: 'hit' });
  });

  // SRD 5.2.1, "Interactions with Rerolls": with Advantage or Disadvantage you
  // "can reroll or replace only one die, not both. You choose which one."
  // So the reroll lands in the PAIR, before keep-highest -- not on the kept die.
  it('5.2.1 reroll applies to one die of an advantage pair, before the keep', () => {
    const s: Situation = {
      actors: [fighter(['inspired']), dummy(20, ['prone'])],
      timeline: [attackStep('s1', 1)],
      intents: { useInspiration: true, rerollDieIndex: 0 },
    };
    const { outcome, trace } = evaluate(s, p521, {
      seed: 'spike',
      forcedRolls: { 's1/attack:fighter': [4, 16], 's1/attack:fighter:reroll': [11] },
    });
    const r = rolls(trace.events)[0];
    expect(r?.mode).toBe('advantage');
    expect(r?.dice).toEqual([4, 16]);
    expect(r?.diceAfterTransforms).toEqual([11, 16]); // the 4 was rerolled, the 16 kept
    // 16 + 3 + 2 = 21 vs AC 20 -> hit.
    // Under ADR-0008's order (transform the ALREADY-KEPT die) this would be
    // 16 -> 11, 11 + 5 = 16 -> miss. The orders are observably different.
    expect(outcome.steps[0]?.attack).toMatchObject({ kept: 16, total: 21, result: 'hit' });
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('2. Bless lasting 10 rounds and expiring mid-sequence', () => {
  // Cleric casts Bless on the fighter on round 1; the fighter attacks every round.
  // "1 minute" = 10 rounds (ADR-0007), anchored to the end of the CASTER's turn
  // in round 1 + 10 = 11. The fighter acts after the cleric, so round 11's attack
  // is already unblessed.
  const ROUNDS = 12;
  const timeline: Step[] = [];
  for (let round = 1; round <= ROUNDS; round++) {
    timeline.push({
      id: `r${round}-cleric`,
      round,
      actorId: 'cleric',
      action: round === 1 ? { type: 'castBless', targetIds: ['fighter'] } : { type: 'none' },
    });
    timeline.push(attackStep(`r${round}-fighter`, round));
  }

  const situation: Situation = {
    actors: [cleric(), fighter(), dummy(20)],
    timeline,
    intents: {},
  };

  // d20 pinned to 12, Bless d4 pinned to 3, on every fighter step.
  const forcedRolls: Record<string, number[]> = {};
  for (let round = 1; round <= ROUNDS; round++) {
    forcedRolls[`r${round}-fighter/attack:fighter`] = [12];
    forcedRolls[`r${round}-fighter/attack:fighter:bless`] = [3];
  }

  const { outcome, trace } = evaluate(situation, p51, { seed: 'spike', forcedRolls });
  const attacks = outcome.steps.filter((s) => s.attack);

  it('blessed rounds hit: 12 + 3 str + 2 prof + 3 bless = 20 vs AC 20', () => {
    expect(attacks).toHaveLength(ROUNDS);
    expect(attacks.slice(0, 10).map((s) => s.round)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const s of attacks.slice(0, 10)) {
      expect(s.attack).toMatchObject({ total: 20, result: 'hit' });
    }
  });

  it('after expiry the same dice miss: 12 + 3 + 2 = 17 vs AC 20', () => {
    expect(attacks.slice(10).map((s) => s.round)).toEqual([11, 12]);
    for (const s of attacks.slice(10)) {
      expect(s.attack).toMatchObject({ total: 17, result: 'miss' });
    }
  });

  it('the scheduled end is reported when the effect is applied, not when it ends', () => {
    const applied = trace.events.find((e) => e.kind === 'effectApplied');
    expect(applied).toMatchObject({
      stepId: 'r1-cleric',
      sourceRuleKey: 'spell.bless.cast',
      onActorId: 'fighter',
      // cleric's turn in round 11 is timeline index 20
      expiresAt: { round: 11, stepIndex: 20, edge: 'end' },
    });
  });

  it('exactly one expiry event, in the expire phase of the caster round-11 step', () => {
    const expiries = trace.events.filter((e) => e.kind === 'expiry');
    expect(expiries).toHaveLength(1);
    expect(expiries[0]).toMatchObject({ stepId: 'r11-cleric', phase: 'expire' });
    expect(outcome.activeAtEnd).toEqual([]);
  });

  it('the 1d4 is recorded as a rolled term, not just a total', () => {
    const r = rolls(trace.events).find((e) => e.stepId === 'r1-fighter');
    expect(r?.modifiers).toMatchObject([
      { ruleKey: 'attack.ability-modifier', modifierType: 'ability', value: 3 },
      { ruleKey: 'attack.proficiency', modifierType: 'proficiency', value: 2 },
      { ruleKey: 'spell.bless.attack-bonus', value: 3, rolled: { expr: '1d4', dice: [3] } },
    ]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('3. Prone: melee advantage, ranged disadvantage, cancelling', () => {
  // SRD 5.1 Prone / SRD 5.2.1 Prone [Condition] -- identical wording:
  // "An attack roll against you has Advantage if the attacker is within 5 feet
  //  of you. Otherwise, that attack roll has Disadvantage."
  const run = (
    profile: typeof p51,
    attacker: string[],
    rangeFt: number,
    forced: number[],
    intents: Record<string, unknown> = {},
  ) =>
    evaluate(
      {
        actors: [fighter(attacker), dummy(15, ['prone'])],
        timeline: [attackStep('s1', 1, rangeFt)],
        intents,
      },
      profile,
      { seed: 'spike', forcedRolls: { 's1/attack:fighter': forced } },
    );

  for (const [name, profile] of [
    ['5.1', p51],
    ['5.2.1', p521],
  ] as const) {
    it(`${name}: melee within 5 ft has advantage -> keep 16, 16 + 5 = 21 -> hit`, () => {
      const { outcome, trace } = run(profile, [], 5, [4, 16]);
      expect(rolls(trace.events)[0]?.mode).toBe('advantage');
      expect(outcome.steps[0]?.attack).toMatchObject({ kept: 16, total: 21, result: 'hit' });
    });

    it(`${name}: ranged beyond 5 ft has disadvantage -> keep 4, 4 + 5 = 9 -> miss`, () => {
      const { outcome, trace } = run(profile, [], 30, [4, 16]);
      expect(rolls(trace.events)[0]?.mode).toBe('disadvantage');
      expect(outcome.steps[0]?.attack).toMatchObject({ kept: 4, total: 9, result: 'miss' });
    });

    it(`${name}: a poisoned attacker cancels the prone advantage -> one d20`, () => {
      const { outcome, trace } = run(profile, ['poisoned'], 5, [4, 16]);
      const r = rolls(trace.events)[0];
      expect(r?.mode).toBe('normal');
      expect(r?.modeInputs).toEqual([
        { ruleKey: 'condition.prone.attacked-within-5ft', mode: 'advantage' },
        { ruleKey: 'condition.poisoned.attacks', mode: 'disadvantage' },
      ]);
      expect(r?.dice).toHaveLength(1); // only one die is rolled at all
      expect(outcome.steps[0]?.attack).toMatchObject({ kept: 4, total: 9, result: 'miss' });
    });

    it(`${name}: two disadvantage sources against one advantage still cancel`, () => {
      const { trace } = run(profile, ['poisoned', 'prone'], 5, [4, 16]);
      const r = rolls(trace.events)[0];
      expect(r?.modeInputs).toHaveLength(3);
      expect(r?.mode).toBe('normal');
      expect(r?.dice).toHaveLength(1);
    });
  }

  it('a house flanking layer adds a second advantage but does not double it', () => {
    const profile = resolveProfile([srd521, houseFlanking]);
    const { outcome, trace } = evaluate(
      {
        actors: [fighter(), dummy(15, ['prone'])],
        timeline: [attackStep('s1', 1, 5)],
        intents: { flanking: true },
      },
      profile,
      { seed: 'spike', forcedRolls: { 's1/attack:fighter': [4, 16] } },
    );
    const r = rolls(trace.events)[0];
    expect(r?.modeInputs.map((m) => m.mode)).toEqual(['advantage', 'advantage']);
    expect(r?.mode).toBe('advantage');
    expect(r?.dice).toHaveLength(2);
    expect(outcome.steps[0]?.attack).toMatchObject({ kept: 16, total: 21, result: 'hit' });
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('determinism and trace coverage', () => {
  const situation: Situation = {
    actors: [fighter(['inspired']), dummy(15, ['prone'])],
    timeline: [attackStep('s1', 1), attackStep('s2', 2)],
    intents: { useInspiration: true },
  };

  it('same seed, no forced rolls -> identical outcome and trace', () => {
    const a = evaluate(situation, p521, { seed: 'sword-coast' });
    const b = evaluate(situation, p521, { seed: 'sword-coast' });
    expect(a).toEqual(b);
  });

  it('a different seed changes the dice', () => {
    const a = evaluate(situation, p521, { seed: 'sword-coast' });
    const b = evaluate(situation, p521, { seed: 'neverwinter' });
    expect(a.outcome.steps).not.toEqual(b.outcome.steps);
  });

  it('every enabled rule in the profile emits one event per step and phase', () => {
    const { trace } = evaluate(situation, p521, { seed: 'spike' });
    for (const stepId of ['s1', 's2']) {
      const keys = trace.events
        .filter((e) => e.kind === 'rule' && e.stepId === stepId)
        .map((e) => (e as Extract<TraceEvent, { kind: 'rule' }>).ruleKey);
      expect(new Set(keys).size).toBe(p521.length);
      expect(keys).toHaveLength(p521.length);
    }
  });

  it('skipped rules carry the facts they read', () => {
    const { trace } = evaluate(situation, p521, { seed: 'spike' });
    const skipped = trace.events.find(
      (e) => e.kind === 'rule' && e.ruleKey === 'condition.prone.attacked-beyond-5ft',
    ) as Extract<TraceEvent, { kind: 'rule' }> | undefined;
    expect(skipped?.status).toBe('skipped');
    expect(skipped?.factsRead.map((r) => r.path)).toEqual([
      'step.action.type',
      'actor.dummy.conditions',
      'action.rangeFt',
    ]);
  });
});
