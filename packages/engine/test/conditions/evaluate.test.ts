import { describe, expect, it } from 'vitest';
import { ConditionTypeError, evaluateCondition } from '../../src/conditions';
import type { Condition } from '../../src/schema';
import { facts, registry, testSource } from './helpers';

function run(condition: Condition, values = facts as Record<string, unknown>) {
  const { source, reads } = testSource(values as Parameters<typeof testSource>[0]);
  return { ...evaluateCondition(condition, registry, source), reads };
}

describe('evaluateCondition — operators', () => {
  it('compares strictly, with no type coercion', () => {
    expect(run({ '==': [{ var: 'action.rangeFt' }, 5] }).value).toBe(true);
    // The JS `==` this syntax is named after would coerce '5' to 5; ours does not.
    expect(run({ '==': [{ var: 'action.rangeFt' }, '5'] }).value).toBe(false);
    expect(run({ '!=': [{ var: 'action.rangeFt' }, '5'] }).value).toBe(true);
  });

  it('orders numbers', () => {
    expect(run({ '<': [{ var: 'action.rangeFt' }, 10] }).value).toBe(true);
    expect(run({ '<=': [{ var: 'action.rangeFt' }, 5] }).value).toBe(true);
    expect(run({ '>': [{ var: 'action.rangeFt' }, 5] }).value).toBe(false);
    expect(run({ '>=': [{ var: 'action.rangeFt' }, 5] }).value).toBe(true);
  });

  it('refuses to order non-numbers rather than falling back to JS string ordering', () => {
    expect(() => run({ '<': [{ var: 'actor.name' }, 'Zombie'] })).toThrow(ConditionTypeError);
  });

  it('refuses array operands in a comparison', () => {
    // `Operand` allows an array only so `in` has a literal set to test against.
    expect(() => run({ '==': [{ var: 'actor.conditions' }, ['prone']] })).toThrow(
      ConditionTypeError,
    );
  });

  it('tests set membership with `in`, needle first', () => {
    expect(run({ in: ['prone', { var: 'actor.conditions' }] }).value).toBe(true);
    expect(run({ in: ['blessed', { var: 'actor.conditions' }] }).value).toBe(false);
    expect(run({ in: [{ var: 'step.action.type' }, ['attack', 'cast']] }).value).toBe(true);
  });

  it('refuses `in` against a non-array right operand', () => {
    expect(() => run({ in: ['prone', { var: 'actor.name' }] })).toThrow(ConditionTypeError);
  });

  it('nests all / any / not', () => {
    const condition: Condition = {
      all: [
        { in: ['prone', { var: 'actor.conditions' }] },
        {
          any: [
            { '==': [{ var: 'step.action.type' }, 'cast'] },
            { '<=': [{ var: 'action.rangeFt' }, 5] },
          ],
        },
        { not: { '==': [{ var: 'actor.surprised' }, true] } },
      ],
    };
    const result = run(condition);
    expect(result.value).toBe(true);
    expect(result.failedAt).toBeNull();
  });
});

describe('evaluateCondition — factsRead (FR-14)', () => {
  it('records paths with their values, in read order', () => {
    const result = run({
      all: [
        { '==': [{ var: 'step.action.type' }, 'attack'] },
        { in: ['prone', { var: 'actor.conditions' }] },
        { '<=': [{ var: 'action.rangeFt' }, 5] },
      ],
    });
    expect(result.value).toBe(true);
    expect(result.factsRead).toEqual([
      { path: 'step.action.type', value: 'attack' },
      { path: 'actor.conditions', value: ['prone'] },
      { path: 'action.rangeFt', value: 5 },
    ]);
  });

  it('reports the vars actually visited, not the vars present (ADR-0013)', () => {
    // `all` short-circuits on the first false child, so the second child's var is
    // never read. A static scan of the tree would over-report it.
    const result = run({
      all: [{ '==': [{ var: 'actor.surprised' }, true] }, { '==': [{ var: 'action.rangeFt' }, 5] }],
    });
    expect(result.value).toBe(false);
    expect(result.factsRead).toEqual([{ path: 'actor.surprised', value: false }]);
    expect(result.reads).toEqual(['actor.surprised']);
  });

  it('stops reading as soon as `any` is satisfied', () => {
    const result = run({
      any: [
        { '==': [{ var: 'step.action.type' }, 'attack'] },
        { '==': [{ var: 'action.rangeFt' }, 5] },
      ],
    });
    expect(result.value).toBe(true);
    expect(result.reads).toEqual(['step.action.type']);
  });

  it('records a path once per read, so a path read twice appears twice', () => {
    const result = run({
      all: [{ '>=': [{ var: 'action.rangeFt' }, 5] }, { '<=': [{ var: 'action.rangeFt' }, 30] }],
    });
    expect(result.factsRead.map((f) => f.path)).toEqual(['action.rangeFt', 'action.rangeFt']);
  });
});
