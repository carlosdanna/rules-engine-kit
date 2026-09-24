import { describe, expect, it } from 'vitest';
import { diffOutcomes } from '../../src/diff';
import { outcome, roll, step } from './fixtures';

describe('diffOutcomes (FR-16)', () => {
  it('reports two equal outcomes as identical', () => {
    const diff = diffOutcomes(outcome(), outcome());
    expect(diff.identical).toBe(true);
    expect(diff.values).toEqual([]);
    expect(diff.onlyA).toEqual([]);
    expect(diff.onlyB).toEqual([]);
  });

  it('names a differing roll total by step and roll id, with both values', () => {
    const a = outcome();
    const b = outcome({ steps: [step({ rolls: [roll({ kept: 17, total: 17 })] })] });

    expect(diffOutcomes(a, b).values).toEqual([
      { path: 'steps[r1-fighter].rolls[r1-fighter/attack:fighter].kept', a: 12, b: 17 },
      { path: 'steps[r1-fighter].rolls[r1-fighter/attack:fighter].total', a: 12, b: 17 },
    ]);
  });

  it('aligns steps on stepId, not position', () => {
    const second = step({ stepId: 'r2-fighter', round: 2, rolls: [], comparisons: [] });
    const a = outcome({ steps: [step(), second] });
    const b = outcome({ steps: [second, step()] });

    expect(diffOutcomes(a, b).identical).toBe(true);
  });

  it('lists a step present on one side only as onlyA / onlyB, not as a value', () => {
    const extra = step({ stepId: 'r0-initiative', rolls: [], comparisons: [] });
    const diff = diffOutcomes(outcome({ steps: [extra, step()] }), outcome());

    expect(diff.onlyA).toEqual(['steps[r0-initiative]']);
    expect(diff.onlyB).toEqual([]);
    expect(diff.values).toEqual([]);
    expect(diff.identical).toBe(false);
  });

  it('reports a halt on one side as a value that differs', () => {
    const halted = { ruleKey: 'combat.surprise', reason: 'surprised' };
    const diff = diffOutcomes(outcome({ steps: [step({ halted })] }), outcome());

    expect(diff.values).toContainEqual({ path: 'steps[r1-fighter].halted', a: halted, b: null });
  });

  it('compares comparisons, damage and the final state by key', () => {
    const b = outcome({
      steps: [
        step({
          comparisons: [
            {
              rollId: 'r1-fighter/attack:fighter',
              target: { kind: 'attack', actorId: 'fighter' },
              total: 12,
              dc: 11,
              result: 'hit',
            },
          ],
          damage: [
            { actorId: 'goblin', damageType: 'slashing', amount: 6, hpAfter: 1, overflow: 0 },
          ],
        }),
      ],
      finalState: {
        actors: {
          fighter: { id: 'fighter', hpCurrent: 28, conditions: [] },
          goblin: { id: 'goblin', hpCurrent: 1, conditions: ['prone'] },
        },
        activeEffects: [],
      },
    });

    const diff = diffOutcomes(outcome(), b);
    expect(diff.values).toEqual([
      { path: 'steps[r1-fighter].comparisons[r1-fighter/attack:fighter].dc', a: 15, b: 11 },
      {
        path: 'steps[r1-fighter].comparisons[r1-fighter/attack:fighter].result',
        a: 'miss',
        b: 'hit',
      },
      { path: 'finalState.actors[goblin].hpCurrent', a: 7, b: 1 },
      { path: 'finalState.actors[goblin].conditions', a: [], b: ['prone'] },
    ]);
    expect(diff.onlyB).toEqual(['steps[r1-fighter].damage[goblin]']);
  });

  it('aligns derived values on (stepId, actorId, path) — the key ADR-0019 added', () => {
    const derived = (stepId: string, total: number) => ({
      path: 'actor.ac.effective',
      actorId: 'goblin',
      stepId,
      base: 15,
      terms: [],
      total,
    });
    const a = outcome({ derived: [derived('r1-fighter', 15), derived('r2-fighter', 15)] });
    const b = outcome({ derived: [derived('r1-fighter', 15), derived('r2-fighter', 17)] });

    expect(diffOutcomes(a, b).values).toEqual([
      { path: 'derived[r2-fighter/goblin/actor.ac.effective].total', a: 15, b: 17 },
    ]);
  });

  it('keeps identity fields apart from the values that differ', () => {
    const diff = diffOutcomes(outcome(), outcome({ profileHash: 'sha256:bbbb' }));

    expect(diff.identical).toBe(true);
    expect(diff.identity.profileHash).toEqual({ a: 'sha256:aaaa', b: 'sha256:bbbb' });
    expect(diff.identity.seed).toEqual({ a: 'golden', b: 'golden' });
  });

  it('numbers a repeated key rather than collapsing it', () => {
    const hit = { actorId: 'goblin', damageType: 'slashing', amount: 3, hpAfter: 4, overflow: 0 };
    const a = outcome({ steps: [step({ damage: [hit, { ...hit, hpAfter: 1 }] })] });
    const b = outcome({ steps: [step({ damage: [hit] })] });

    expect(diffOutcomes(a, b).onlyA).toEqual(['steps[r1-fighter].damage[goblin#2]']);
  });
});
