import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { poolSize, type RollModeInput, resolveRollMode } from '../../src/dice';

const arbGrant: fc.Arbitrary<RollModeInput> = fc.record({
  ruleKey: fc.string({ minLength: 1, maxLength: 5 }),
  mode: fc.constantFrom('advantage' as const, 'disadvantage' as const),
});

const arbGrants = fc.array(arbGrant, { maxLength: 10 });

function permute<T>(items: readonly T[], seed: number): T[] {
  return [...items]
    .map((item, index) => ({ item, order: (index * 2654435761 + seed) % 4294967296 }))
    .sort((a, b) => a.order - b.order)
    .map(({ item }) => item);
}

describe('resolveRollMode — advantage and disadvantage cancel (FR-11, NFR-4)', () => {
  it('always resolves to normal when both are present, however many of each', () => {
    // SRD 5.2.1 *Playing the Game > D20 Tests*: "even if multiple circumstances impose
    // Disadvantage and only one grants Advantage or vice versa". Presence, not count.
    fc.assert(
      fc.property(arbGrants, (grants) => {
        fc.pre(
          grants.some((g) => g.mode === 'advantage') &&
            grants.some((g) => g.mode === 'disadvantage'),
        );
        expect(resolveRollMode(grants)).toBe('normal');
      }),
    );
  });

  it('rolls a single die when the modes cancel', () => {
    fc.assert(
      fc.property(arbGrants, (grants) => {
        fc.pre(
          grants.some((g) => g.mode === 'advantage') &&
            grants.some((g) => g.mode === 'disadvantage'),
        );
        expect(poolSize(resolveRollMode(grants))).toBe(1);
      }),
    );
  });

  it('is order-independent, so it is a set operation and not a fold', () => {
    fc.assert(
      fc.property(arbGrants, fc.nat(), (grants, seed) => {
        expect(resolveRollMode(permute(grants, seed))).toBe(resolveRollMode(grants));
      }),
    );
  });

  it('is idempotent: repeating every grant changes nothing', () => {
    fc.assert(
      fc.property(arbGrants, (grants) => {
        expect(resolveRollMode([...grants, ...grants])).toBe(resolveRollMode(grants));
      }),
    );
  });

  it('resolves to the one-sided mode when only one side is present', () => {
    fc.assert(
      fc.property(arbGrants, (grants) => {
        const advantage = grants.some((g) => g.mode === 'advantage');
        const disadvantage = grants.some((g) => g.mode === 'disadvantage');
        fc.pre(advantage !== disadvantage);
        expect(resolveRollMode(grants)).toBe(advantage ? 'advantage' : 'disadvantage');
        expect(poolSize(resolveRollMode(grants))).toBe(2);
      }),
    );
  });
});
