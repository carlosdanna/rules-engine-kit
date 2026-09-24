/**
 * Every home-page row runs, and says what the requirements table says (docs/requirements.md,
 * "Acceptance scenarios"). The golden cases are where each outcome is derived by hand under
 * forced dice; this suite checks the *links* — the seeded scenario, the two seeded profiles and
 * the one seed — reach the same conclusions through the path `/compare` actually takes.
 */

import { loadSeedContent, seedDatabase } from '@rules-engine-kit/db';
import type { Outcome, Trace } from '@rules-engine-kit/engine';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ACCEPTANCE, type AcceptanceRow, compareHref } from './acceptance';
import { compareRuns } from './compare/run';
import { memoryDb, type TestDb } from './scenarios/test-db';

let database: TestDb;

beforeAll(() => {
  database = memoryDb();
  seedDatabase(database.db, loadSeedContent());
});

afterAll(() => database.close());

function run(id: string) {
  const row = ACCEPTANCE.find((candidate) => candidate.id === id) as AcceptanceRow;
  const result = compareRuns(database.db, {
    scenarioId: row.scenario,
    a: row.a,
    b: row.b,
    seed: row.seed,
  });
  if (!result.ok) throw new Error(result.formErrors.join('\n'));
  return result.data;
}

const fired = (trace: Trace, ruleKey: string) =>
  trace.events.some(
    (event) => event.kind === 'rule' && event.ruleKey === ruleKey && event.status === 'fired',
  );

const attackRoll = (outcome: Outcome) =>
  outcome.steps.flatMap((step) => step.rolls).find((roll) => roll.target.kind === 'attack');

describe('the acceptance rows', () => {
  it('lists the five scenarios, each linking into /compare', () => {
    expect(ACCEPTANCE.map((row) => row.id)).toEqual([
      'surprise',
      'inspiration',
      'use-an-object',
      'weapon-mastery',
      'flanking',
    ]);
    expect(compareHref(ACCEPTANCE[0] as AcceptanceRow)).toBe(
      '/compare?scenario=combat-start&a=srd-5.1&b=srd-5.2.1&seed=demo',
    );
  });

  it('1. surprise: 5.1 halts the first turn; 5.2.1 acts, with disadvantage on initiative', () => {
    const { a, b } = run('surprise');
    expect(a.outcome.steps.some((step) => step.halted?.ruleKey === 'combat.surprise')).toBe(true);
    expect(b.outcome.steps.every((step) => step.halted === null)).toBe(true);
    const initiative = b.outcome.steps
      .flatMap((step) => step.rolls)
      .find((roll) => roll.target.kind === 'check');
    expect(initiative?.mode).toBe('disadvantage');
  });

  it('2. inspiration: 5.1 grants advantage; 5.2.1 rerolls a normal d20', () => {
    const { a, b } = run('inspiration');
    expect(attackRoll(a.outcome)?.mode).toBe('advantage');
    expect(attackRoll(b.outcome)?.mode).toBe('normal');
    expect(fired(a.trace, 'inspiration.spend')).toBe(true);
    expect(fired(b.trace, 'inspiration.spend')).toBe(true);
  });

  it('3. use an object: the same rule key names a different action', () => {
    const { a, b } = run('use-an-object');
    expect(a.outcome.events).toEqual([
      expect.objectContaining({ event: 'action.use-object', data: { action: 'Use an Object' } }),
    ]);
    expect(b.outcome.events).toEqual([
      expect.objectContaining({ event: 'action.use-object', data: { action: 'Utilize' } }),
    ]);
  });

  it('4. weapon mastery: the attack hits under both, and only 5.2.1 saps the target', () => {
    const { a, b } = run('weapon-mastery');
    for (const side of [a, b]) {
      expect(side.outcome.steps[0]?.comparisons[0]?.result).toBe('hit');
    }
    expect(fired(a.trace, 'weapon.mastery.sap')).toBe(false);
    expect(fired(b.trace, 'weapon.mastery.sap')).toBe(true);
    expect(b.outcome.finalState.actors.target?.conditions).toContain('sapped');
    expect(a.outcome.finalState.actors.target?.conditions).not.toContain('sapped');
  });

  it('5. prone + flanking: two grants, one advantage, on either base', () => {
    const { a, b } = run('flanking');
    for (const side of [a, b]) {
      expect(attackRoll(side.outcome)?.mode).toBe('advantage');
      expect(fired(side.trace, 'condition.prone.attacked')).toBe(true);
      expect(fired(side.trace, 'house.flanking')).toBe(true);
    }
  });
});
