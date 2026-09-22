import { z } from 'zod';
import { createFactRegistry, type FactSource } from '../../src/conditions';
import type { Json } from '../../src/schema';

/** The shape a pack's `facts.yaml` loads into: every path a condition may read. */
export const registry = createFactRegistry([
  { path: 'actor.surprised', type: z.boolean() },
  { path: 'actor.conditions', type: z.array(z.string()) },
  { path: 'actor.name', type: z.string() },
  { path: 'action.rangeFt', type: z.number().int() },
  { path: 'step.action.type', type: z.string() },
]);

/** A `FactSource` over a flat map, recording the order paths were read in. */
export function testSource(values: Record<string, Json>): {
  source: FactSource;
  reads: string[];
} {
  const reads: string[] = [];
  return {
    reads,
    source: {
      read(path) {
        reads.push(path);
        const value = values[path];
        if (value === undefined) {
          throw new Error(`test source has no value for '${path}'`);
        }
        return value;
      },
    },
  };
}

export const facts = {
  'actor.surprised': false,
  'actor.conditions': ['prone'],
  'actor.name': 'Goblin',
  'action.rangeFt': 5,
  'step.action.type': 'attack',
} satisfies Record<string, Json>;
