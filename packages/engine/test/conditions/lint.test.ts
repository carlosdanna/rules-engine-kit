import { describe, expect, it } from 'vitest';
import { evaluateCondition, lintCondition, UnknownFactError } from '../../src/conditions';
import type { Condition } from '../../src/schema';
import { facts, registry, testSource } from './helpers';

describe('lintCondition (FR-17)', () => {
  it('passes a condition whose every var is registered', () => {
    const lint = lintCondition(
      {
        all: [
          { in: ['prone', { var: 'actor.conditions' }] },
          { '>=': [{ var: 'action.rangeFt' }, 5] },
        ],
      },
      registry,
    );
    expect(lint.unknownPaths).toEqual([]);
    expect(lint.unsupportedOperators).toEqual([]);
  });

  it('lists every unknown var path, not just the first', () => {
    const lint = lintCondition(
      {
        all: [{ '==': [{ var: 'actor.morale' }, 'steady'] }, { '==': [{ var: 'actor.luck' }, 1] }],
      },
      registry,
    );
    expect(lint.unknownPaths.map((issue) => [issue.path, issue.pointer])).toEqual([
      ['actor.morale', '/all/0/==/0'],
      ['actor.luck', '/all/1/==/0'],
    ]);
  });

  it('scans branches evaluation would short-circuit past', () => {
    // The opposite of `factsRead`: lint is static, so an unreachable branch is still checked.
    const lint = lintCondition(
      {
        any: [
          { '==': [{ var: 'step.action.type' }, 'attack'] },
          { '==': [{ var: 'actor.morale' }, 1] },
        ],
      },
      registry,
    );
    expect(lint.unknownPaths.map((issue) => issue.path)).toEqual(['actor.morale']);
  });

  it('reports an operator outside the closed set', () => {
    const lint = lintCondition({ '+': [1, 2] }, registry);
    expect(lint.unsupportedOperators).toEqual([
      { operator: '+', pointer: '/+', message: expect.any(String) },
    ]);
  });

  it('does not throw on malformed authored content', () => {
    // Lint runs before the Zod parse, so it has to survive anything a YAML file holds.
    expect(() => lintCondition(null, registry)).not.toThrow();
    expect(() => lintCondition({ all: 'not an array' }, registry)).not.toThrow();
    expect(() => lintCondition({ all: [{ var: 'actor.morale' }] }, registry)).not.toThrow();
  });

  it('guarantees a clean lint cannot throw UnknownFactError at run time (ADR-0013)', () => {
    const condition: Condition = {
      all: [
        { not: { '==': [{ var: 'actor.surprised' }, true] } },
        {
          any: [{ '==': [{ var: 'actor.name' }, 'Orc'] }, { '<': [{ var: 'action.rangeFt' }, 30] }],
        },
      ],
    };
    expect(lintCondition(condition, registry).unknownPaths).toEqual([]);
    expect(() => evaluateCondition(condition, registry, testSource(facts).source)).not.toThrow(
      UnknownFactError,
    );
  });
});
