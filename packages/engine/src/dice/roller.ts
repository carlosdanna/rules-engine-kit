import type { RollId } from '../schema';
import { hashSeed, mulberry32, type Rng } from './rng';

/** One die, as the trace and `forcedRolls` address it. */
export type RollRecord = {
  rollId: RollId;
  /** Position within this roll id's channel; indexes into `forcedRolls[rollId]`. */
  index: number;
  sides: number;
  value: number;
  forced: boolean;
};

export type Roller = {
  readonly seed: string;
  roll(rollId: RollId, sides: number): RollRecord;
  /** Every die drawn, in order. The evaluator folds it into the outcome for replay (VR-7). */
  readonly log: readonly RollRecord[];
};

export class ForcedRollError extends Error {
  readonly code = 'FORCED_ROLL';
  readonly rollId: RollId;

  constructor(rollId: RollId, index: number, value: number, sides: number) {
    super(`forced roll ${rollId}[${index}] is ${value}, which is not a face of a d${sides}`);
    this.name = 'ForcedRollError';
    this.rollId = rollId;
  }
}

/**
 * A seeded roller, injected per evaluation and never global (ADR-0002). Same seed and
 * same `forcedRolls` ⇒ same dice, which is half of NFR-1.
 *
 * A forced value does **not** consume the stream: forcing is for fixtures that pin one
 * channel and let the rest fall out of the seed (FR-13), so drawing from the stream for a
 * die nobody rolled would make a partially-forced run depend on how many dice were forced.
 */
export function createRoller(options: {
  seed: string;
  forcedRolls?: Record<RollId, number[]>;
}): Roller {
  const rng: Rng = mulberry32(hashSeed(options.seed));
  const forced = options.forcedRolls ?? {};
  const counters = new Map<RollId, number>();
  const log: RollRecord[] = [];

  return {
    seed: options.seed,
    log,
    roll(rollId, sides) {
      if (!Number.isInteger(sides) || sides < 1) {
        throw new Error(`a die needs at least one side, got ${sides}`);
      }

      const index = counters.get(rollId) ?? 0;
      counters.set(rollId, index + 1);

      const forcedValue = forced[rollId]?.[index];
      if (forcedValue !== undefined && (forcedValue < 1 || forcedValue > sides)) {
        throw new ForcedRollError(rollId, index, forcedValue, sides);
      }

      const record: RollRecord = {
        rollId,
        index,
        sides,
        value: forcedValue ?? 1 + Math.floor(rng() * sides),
        forced: forcedValue !== undefined,
      };
      log.push(record);
      return record;
    },
  };
}
