import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { selectRules } from '../../src/evaluator';
import { compareResolvedRules } from '../../src/resolver';
import { PHASES, type Phase, type ResolvedRule } from '../../src/schema';

const arbRule = fc
  .record({
    key: fc.string({ minLength: 1, maxLength: 5 }),
    phase: fc.constantFrom(...PHASES),
    priority: fc.integer({ min: -50, max: 50 }),
  })
  .map(
    ({ key, phase, priority }): ResolvedRule => ({
      key,
      phase,
      priority,
      label: key,
      description: key,
      tags: [],
      condition: null,
      effects: [],
      citation: { source: 'srd-5.2.1', section: 'test' },
      interpretation: null,
      enabled: true,
      provenance: [{ layer: 'dnd5e-srd', version: '5.2.1', op: 'add' }],
    }),
  );

/** Distinct keys: two rules sharing a key are a resolver conflict, not an ordering case. */
const arbRules = fc.uniqueArray(arbRule, { selector: (rule) => rule.key, maxLength: 20 });

function permute<T>(items: readonly T[], seed: number): T[] {
  return [...items]
    .map((item, index) => ({ item, order: (index * 2654435761 + seed) % 4294967296 }))
    .sort((a, b) => a.order - b.order)
    .map(({ item }) => item);
}

describe('compareResolvedRules — ordering is stable (FR-9, NFR-4)', () => {
  it('sorts any permutation of the same rules into the same order', () => {
    fc.assert(
      fc.property(arbRules, fc.nat(), (rules, seed) => {
        const fromShuffled = permute(rules, seed)
          .sort(compareResolvedRules)
          .map((r) => r.key);
        const fromOriginal = [...rules].sort(compareResolvedRules).map((r) => r.key);
        expect(fromShuffled).toEqual(fromOriginal);
      }),
    );
  });

  it('is a total order: antisymmetric, and zero only for the same key', () => {
    fc.assert(
      fc.property(arbRule, arbRule, (a, b) => {
        expect(Math.sign(compareResolvedRules(a, b))).toBe(-Math.sign(compareResolvedRules(b, a)));
        if (compareResolvedRules(a, b) === 0) expect(a.key).toBe(b.key);
      }),
    );
  });

  it('orders by phase, then priority, then key — never by anything else', () => {
    fc.assert(
      fc.property(arbRules, (rules) => {
        const sorted = [...rules].sort(compareResolvedRules);
        for (let i = 1; i < sorted.length; i++) {
          const previous = sorted[i - 1];
          const current = sorted[i];
          if (previous === undefined || current === undefined) continue;
          const phaseOrder = PHASES.indexOf(previous.phase) - PHASES.indexOf(current.phase);
          if (phaseOrder !== 0) {
            expect(phaseOrder).toBeLessThan(0);
          } else if (previous.priority !== current.priority) {
            expect(previous.priority).toBeLessThan(current.priority);
          } else {
            expect(previous.key < current.key).toBe(true);
          }
        }
      }),
    );
  });
});

describe('selectRules — what a phase runs (FR-9)', () => {
  it('returns exactly that phase’s rules, in comparator order, whatever order it was given', () => {
    fc.assert(
      fc.property(arbRules, fc.nat(), fc.constantFrom(...PHASES), (rules, seed, phase: Phase) => {
        const selected = selectRules(permute(rules, seed), phase);
        expect(selected.map((rule) => rule.key).sort()).toEqual(
          rules
            .filter((rule) => rule.phase === phase)
            .map((rule) => rule.key)
            .sort(),
        );
        expect(selected.map((rule) => rule.key)).toEqual(
          [...selected].sort(compareResolvedRules).map((rule) => rule.key),
        );
      }),
    );
  });
});
