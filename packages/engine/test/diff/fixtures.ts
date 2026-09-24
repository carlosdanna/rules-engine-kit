/**
 * Hand-built outcomes for the diff tests. Like the trace fixtures, these are the smallest
 * values that exercise an alignment, not a run of any content: the numbers mean nothing.
 */

import type { Outcome, RollOutcome, StepOutcome } from '../../src/schema';
import { ENGINE_VERSION, TRACE_SCHEMA_VERSION } from '../../src/version';

export function roll(overrides: Partial<RollOutcome> = {}): RollOutcome {
  return {
    rollId: 'r1-fighter/attack:fighter',
    target: { kind: 'attack', actorId: 'fighter' },
    mode: 'normal',
    kept: 12,
    modifiers: [],
    total: 12,
    forced: false,
    ...overrides,
  };
}

export function step(overrides: Partial<StepOutcome> = {}): StepOutcome {
  return {
    stepId: 'r1-fighter',
    round: 1,
    actorId: 'fighter',
    rolls: [roll()],
    comparisons: [
      {
        rollId: 'r1-fighter/attack:fighter',
        target: { kind: 'attack', actorId: 'fighter' },
        total: 12,
        dc: 15,
        result: 'miss',
      },
    ],
    damage: [],
    halted: null,
    ...overrides,
  };
}

export function outcome(overrides: Partial<Outcome> = {}): Outcome {
  return {
    steps: [step()],
    finalState: {
      actors: {
        fighter: { id: 'fighter', hpCurrent: 28, conditions: [] },
        goblin: { id: 'goblin', hpCurrent: 7, conditions: [] },
      },
      activeEffects: [],
    },
    derived: [],
    events: [],
    seed: 'golden',
    profileHash: 'sha256:aaaa',
    engineVersion: ENGINE_VERSION,
    traceSchemaVersion: TRACE_SCHEMA_VERSION,
    ...overrides,
  };
}
