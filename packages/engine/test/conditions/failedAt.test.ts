import { describe, expect, it } from 'vitest';
import { evaluateCondition } from '../../src/conditions';
import type { Condition } from '../../src/schema';
import { facts, registry, testSource } from './helpers';

function run(condition: Condition) {
  return evaluateCondition(condition, registry, testSource(facts).source);
}

/**
 * A node's pointer ends in its operator token (`/all/1/==`), so the node itself is what
 * you get by walking every token *but* the last. Used to prove `failedAt` addresses a
 * node that really evaluated false.
 */
function nodeAt(condition: Condition, pointer: string): Condition {
  const tokens = pointer.split('/').slice(1);
  let node: unknown = condition;
  for (const token of tokens.slice(0, -1)) {
    node = (node as Record<string, unknown>)[token];
  }
  return node as Condition;
}

describe('failedAt — short-circuit semantics are the contract (ADR-0013)', () => {
  it('is null when the condition passed', () => {
    expect(run({ '==': [{ var: 'step.action.type' }, 'attack'] }).failedAt).toBeNull();
  });

  it('points at a root-level comparison by its own operator', () => {
    // Never the empty RFC 6901 root pointer: `SkipReason.failedAt` is `min(1)`.
    expect(run({ '==': [{ var: 'actor.surprised' }, true] }).failedAt).toBe('/==');
  });

  it('`all` reports its first false child', () => {
    expect(
      run({
        all: [
          { '==': [{ var: 'actor.surprised' }, true] },
          { '==': [{ var: 'step.action.type' }, 'cast'] },
        ],
      }).failedAt,
    ).toBe('/all/0/==');

    expect(
      run({
        all: [
          { '==': [{ var: 'step.action.type' }, 'attack'] },
          { '==': [{ var: 'actor.surprised' }, true] },
        ],
      }).failedAt,
    ).toBe('/all/1/==');
  });

  it('`any` reports its own pointer when every child was false', () => {
    expect(
      run({
        any: [
          { '==': [{ var: 'actor.surprised' }, true] },
          { '==': [{ var: 'step.action.type' }, 'cast'] },
        ],
      }).failedAt,
    ).toBe('/any');
  });

  it('`not` reports the child that was true', () => {
    expect(run({ not: { '==': [{ var: 'step.action.type' }, 'attack'] } }).failedAt).toBe(
      '/not/==',
    );
  });

  it('propagates through nesting to the leaf that actually failed', () => {
    expect(
      run({
        all: [
          {
            any: [
              { '==': [{ var: 'actor.surprised' }, true] },
              { '==': [{ var: 'step.action.type' }, 'cast'] },
            ],
          },
        ],
      }).failedAt,
    ).toBe('/all/0/any');

    expect(
      run({
        all: [
          {
            all: [
              { '==': [{ var: 'step.action.type' }, 'attack'] },
              { not: { in: ['prone', { var: 'actor.conditions' }] } },
            ],
          },
        ],
      }).failedAt,
    ).toBe('/all/0/all/1/not/in');
  });
});

describe('failedAt — property', () => {
  /**
   * ADR-0013 states this two ways that disagree: §Consequences wants "`failedAt` always
   * points at a node that evaluated false", while §Decision's short-circuit contract says
   * `not` reports "the pointer of the child that was true". §Decision is the more specific
   * of the two and names `not` explicitly, so it wins: `failedAt` addresses the node
   * *responsible* for the failure, which is false everywhere except directly under a `not`.
   */
  function expectedVerdictAt(pointer: string): boolean {
    const tokens = pointer.split('/').slice(1);
    return tokens.at(-2) === 'not';
  }

  const failing: Condition[] = [
    { '==': [{ var: 'actor.surprised' }, true] },
    { '>': [{ var: 'action.rangeFt' }, 30] },
    { in: ['blessed', { var: 'actor.conditions' }] },
    { not: { '==': [{ var: 'step.action.type' }, 'attack'] } },
    {
      any: [{ '==': [{ var: 'actor.surprised' }, true] }, { '<': [{ var: 'action.rangeFt' }, 0] }],
    },
    {
      all: [
        { '==': [{ var: 'step.action.type' }, 'attack'] },
        {
          any: [{ '>': [{ var: 'action.rangeFt' }, 30] }, { '==': [{ var: 'actor.name' }, 'Orc'] }],
        },
      ],
    },
    { all: [{ not: { in: ['prone', { var: 'actor.conditions' }] } }] },
  ];

  it.each(failing.map((condition, i) => [i, condition] as const))(
    'case %i: failedAt addresses the node responsible for the failure',
    (_i, condition) => {
      const result = run(condition);
      expect(result.value).toBe(false);
      expect(result.failedAt).not.toBeNull();

      const pointer = result.failedAt as string;
      // Non-empty on every path, so it always satisfies `SkipReason.failedAt`.
      expect(pointer.length).toBeGreaterThan(0);
      expect(run(nodeAt(condition, pointer)).value).toBe(expectedVerdictAt(pointer));
    },
  );
});
