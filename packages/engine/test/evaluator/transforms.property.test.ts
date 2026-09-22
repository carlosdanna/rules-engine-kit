import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/evaluator';
import { resolveProfile } from '../../src/resolver';
import { add, base, facts, situation } from './fixtures';

function runWith(options: { uses: number; dieIndex: number; advantage: boolean }) {
  const rules = [
    add('inspiration.spend', {
      phase: 'modifiers',
      priority: 0,
      effects: [
        {
          type: 'rollTransform',
          target: { kind: 'attack', actor: '$actor' },
          transform: { kind: 'reroll', keep: 'new' },
          uses: options.uses,
          dieSelector: { kind: 'fixed', index: options.dieIndex },
        },
      ],
    }),
  ];
  if (options.advantage) {
    rules.push(
      add('condition.prone.melee', {
        phase: 'modifiers',
        priority: -10,
        effects: [
          { type: 'rollMode', target: { kind: 'attack', actor: '$actor' }, mode: 'advantage' },
        ],
      }),
    );
  }

  const { trace } = evaluate(situation(), resolveProfile([base(rules)]), {
    seed: 'demo-seed',
    facts,
  });
  const roll = trace.events.find((event) => event.kind === 'roll');
  return { trace, roll: roll?.kind === 'roll' ? roll : undefined };
}

const arbOptions = fc.record({
  uses: fc.integer({ min: 1, max: 4 }),
  dieIndex: fc.integer({ min: 0, max: 5 }),
  advantage: fc.boolean(),
});

describe('roll transforms — uses and clamping (ADR-0011, NFR-4)', () => {
  it('applies a transform exactly `uses` times, never more', () => {
    fc.assert(
      fc.property(arbOptions, (options) => {
        const { roll } = runWith(options);
        expect(roll?.transforms).toHaveLength(options.uses);
      }),
    );
  });

  it('never reports a die index outside the pool it acted on', () => {
    fc.assert(
      fc.property(arbOptions, (options) => {
        const { roll } = runWith(options);
        for (const transform of roll?.transforms ?? []) {
          expect(transform.dieIndex).toBeGreaterThanOrEqual(0);
          expect(transform.dieIndex).toBeLessThan(roll?.dice.length ?? 0);
        }
      }),
    );
  });

  it('clamps visibly: an out-of-range selector is traced, not swallowed', () => {
    fc.assert(
      fc.property(arbOptions, (options) => {
        const { trace, roll } = runWith(options);
        const poolSize = roll?.dice.length ?? 0;
        const clamped = trace.events.some(
          (event) => event.kind === 'event' && event.event === 'roll.transform.clamped',
        );
        expect(clamped).toBe(options.dieIndex >= poolSize);
      }),
    );
  });

  it('leaves the kept die consistent with the transformed pool', () => {
    fc.assert(
      fc.property(arbOptions, (options) => {
        const { roll } = runWith(options);
        if (roll === undefined) return;
        expect(roll.diceAfterTransforms[roll.keptIndex]).toBe(roll.kept);
        const expected =
          roll.mode === 'advantage'
            ? Math.max(...roll.diceAfterTransforms)
            : Math.min(...roll.diceAfterTransforms);
        expect(roll.kept).toBe(expected);
      }),
    );
  });
});
