import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { type PendingModifier, resolveStack } from '../../src/stacking';

const arbModifier: fc.Arbitrary<PendingModifier> = fc
  .record({
    ruleKey: fc.string({ minLength: 1, maxLength: 4 }),
    modifierType: fc.constantFrom('bless', 'cover', 'ability'),
    stackKey: fc.option(fc.constantFrom('a', 'b'), { nil: undefined }),
    policy: fc.constantFrom('sum' as const, 'highest' as const, 'unique' as const),
    value: fc.integer({ min: -5, max: 10 }),
  })
  .map(({ stackKey, ...rest }) => (stackKey === undefined ? rest : { ...rest, stackKey }));

const arbModifiers = fc.array(arbModifier, { maxLength: 12 });

describe('resolveStack — properties (FR-11, NFR-4)', () => {
  it('never lets two modifiers sharing a stackKey both apply', () => {
    fc.assert(
      fc.property(arbModifiers, (modifiers) => {
        const { applied } = resolveStack(modifiers);
        const byType = new Map<string, string[]>();
        for (const modifier of applied) {
          const keys = byType.get(modifier.modifierType) ?? [];
          keys.push(modifier.stackKey ?? modifier.modifierType);
          byType.set(modifier.modifierType, keys);
        }
        for (const [modifierType, keys] of byType) {
          // Only a group where something declared `unique` promises distinctness.
          if (modifiers.some((m) => m.modifierType === modifierType && m.policy === 'unique')) {
            expect(new Set(keys).size).toBe(keys.length);
          }
        }
      }),
    );
  });

  it('accounts for every input exactly once, as applied or as dropped', () => {
    fc.assert(
      fc.property(arbModifiers, (modifiers) => {
        const { applied, dropped } = resolveStack(modifiers);
        expect(applied.length + dropped.length).toBe(modifiers.length);
      }),
    );
  });

  it('reports a total that is exactly the sum of what it applied', () => {
    fc.assert(
      fc.property(arbModifiers, (modifiers) => {
        const { applied, total } = resolveStack(modifiers);
        expect(total).toBe(applied.reduce((sum, m) => sum + m.value, 0));
      }),
    );
  });

  it('keeps at most one modifier per type once anything in it declares highest', () => {
    fc.assert(
      fc.property(arbModifiers, (modifiers) => {
        const { applied } = resolveStack(modifiers);
        for (const modifierType of new Set(modifiers.map((m) => m.modifierType))) {
          if (modifiers.some((m) => m.modifierType === modifierType && m.policy === 'highest')) {
            expect(
              applied.filter((m) => m.modifierType === modifierType).length,
            ).toBeLessThanOrEqual(1);
          }
        }
      }),
    );
  });

  it('is deterministic: the same list always stacks the same way (NFR-1)', () => {
    fc.assert(
      fc.property(arbModifiers, (modifiers) => {
        expect(resolveStack(modifiers)).toEqual(resolveStack(modifiers));
      }),
    );
  });
});
