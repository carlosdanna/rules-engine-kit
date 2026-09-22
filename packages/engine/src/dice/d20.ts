import type { RollId, RollMode, RollModeGrant, RollTransform } from '../schema';
import type { Roller, RollRecord } from './roller';
import { REROLL_CHANNEL, withChannel } from './rollId';

export const D20_SIDES = 20;

/** One rule's contribution to a roll's mode, kept with its `rule_key` for the trace. */
export type RollModeInput = { ruleKey: string; mode: RollModeGrant };

/**
 * Advantage and disadvantage cancel as a *set* operation: "even if multiple circumstances
 * impose Disadvantage and only one grants Advantage or vice versa" (SRD 5.2.1, *Playing
 * the Game > D20 Tests*; SRD 5.1, *Using Ability Scores > Advantage and Disadvantage*).
 * So this counts presence, not instances, and is order-independent.
 */
export function resolveRollMode(inputs: readonly RollModeInput[]): RollMode {
  const advantage = inputs.some((input) => input.mode === 'advantage');
  const disadvantage = inputs.some((input) => input.mode === 'disadvantage');
  if (advantage && disadvantage) return 'normal';
  if (advantage) return 'advantage';
  if (disadvantage) return 'disadvantage';
  return 'normal';
}

/** One die normally, two otherwise — and when the modes cancel, only one die is rolled at all. */
export function poolSize(mode: RollMode): number {
  return mode === 'normal' ? 1 : 2;
}

export type RolledPool = { dice: number[]; records: RollRecord[] };

export function rollPool(roller: Roller, rollId: RollId, mode: RollMode): RolledPool {
  const records = Array.from({ length: poolSize(mode) }, () => roller.roll(rollId, D20_SIDES));
  return { dice: records.map((record) => record.value), records };
}

/** A transform the evaluator has already selected, with the die its selector resolved to. */
export type TransformRequest = {
  ruleKey: string;
  transform: RollTransform;
  dieIndex: number;
};

/** Shaped for the `roll` trace event's `transforms[]`, which needs `dieIndex` (ADR-0014). */
export type AppliedTransform = {
  ruleKey: string;
  kind: RollTransform['kind'];
  dieIndex: number;
  from: number;
  to: number;
  /**
   * The requested die was out of range and was clamped into the pool. Reported rather
   * than swallowed, so the trace can show it (ADR-0011 §Consequences).
   */
  clamped: boolean;
};

/**
 * Applies one transform to the dice *pool*, before the keep. Both SRDs let a reroll
 * replace only one die of an advantage pair and leave the choice to the player, and the
 * difference is observable — see the table in ADR-0011 (`docs/spike-notes.md` §2.1).
 *
 * Returns a new pool; the input is never mutated (state is immutable).
 */
export function applyTransform(
  dice: readonly number[],
  request: TransformRequest,
  roller: Roller,
  rollId: RollId,
): { dice: number[]; applied: AppliedTransform; records: RollRecord[] } {
  const dieIndex = Math.min(Math.max(request.dieIndex, 0), dice.length - 1);
  const clamped = dieIndex !== request.dieIndex;
  const from = dice[dieIndex] as number;
  const records: RollRecord[] = [];

  let to: number;
  switch (request.transform.kind) {
    case 'reroll': {
      const fresh = roller.roll(withChannel(rollId, REROLL_CHANNEL), D20_SIDES);
      records.push(fresh);
      // 5.2.1's Heroic Inspiration keeps `new` even when it is worse: "you must use the
      // new roll". A Lucky-style reroll keeps the `higher` of the two.
      to = request.transform.keep === 'higher' ? Math.max(from, fresh.value) : fresh.value;
      break;
    }
    case 'minimumDie':
      to = Math.max(from, request.transform.value);
      break;
    case 'replaceDie':
      to = request.transform.value;
      break;
  }

  const next = [...dice];
  next[dieIndex] = to;
  return {
    dice: next,
    applied: {
      ruleKey: request.ruleKey,
      kind: request.transform.kind,
      dieIndex,
      from,
      to,
      clamped,
    },
    records,
  };
}

/** Step 4: max under advantage, min under disadvantage, the only die otherwise. */
export function keepDie(
  dice: readonly number[],
  mode: RollMode,
): { kept: number; keptIndex: number } {
  const first = dice[0];
  if (first === undefined) {
    throw new Error('cannot keep a die from an empty pool');
  }

  let keptIndex = 0;
  if (mode !== 'normal') {
    for (let index = 1; index < dice.length; index++) {
      const candidate = dice[index] as number;
      const incumbent = dice[keptIndex] as number;
      // Ties keep the earlier die, so the kept index is a function of the pool alone.
      if (mode === 'advantage' ? candidate > incumbent : candidate < incumbent) {
        keptIndex = index;
      }
    }
  }

  return { kept: dice[keptIndex] as number, keptIndex };
}

/** Everything the `roll` trace event needs, minus the modifiers the evaluator adds (step 5). */
export type D20Roll = {
  rollId: RollId;
  mode: RollMode;
  modeInputs: readonly RollModeInput[];
  /** The pool as first rolled. */
  dice: number[];
  transforms: AppliedTransform[];
  /** The pool the keep runs against — the middle state is where the interesting thing happened. */
  diceAfterTransforms: number[];
  kept: number;
  keptIndex: number;
  /** Any die behind this result came from `forcedRolls`. */
  forced: boolean;
};

/**
 * Steps 1–4 of ADR-0011's resolution order: mode → dice pool → transforms on a chosen die
 * of the pool → keep. Step 5 (numeric modifiers and their stacking policies) belongs to
 * `src/stacking/` and the phase loop, as does deciding *which* transforms apply in rule
 * priority order and how their `uses` are consumed; this takes that list already resolved.
 */
export function resolveD20Roll(args: {
  roller: Roller;
  rollId: RollId;
  modeInputs: readonly RollModeInput[];
  transforms?: readonly TransformRequest[];
}): D20Roll {
  const mode = resolveRollMode(args.modeInputs);
  const pool = rollPool(args.roller, args.rollId, mode);

  const records: RollRecord[] = [...pool.records];
  const applied: AppliedTransform[] = [];
  let dice: number[] = pool.dice;

  for (const request of args.transforms ?? []) {
    const step = applyTransform(dice, request, args.roller, args.rollId);
    dice = step.dice;
    applied.push(step.applied);
    records.push(...step.records);
  }

  const { kept, keptIndex } = keepDie(dice, mode);
  return {
    rollId: args.rollId,
    mode,
    modeInputs: args.modeInputs,
    dice: pool.dice,
    transforms: applied,
    diceAfterTransforms: dice,
    kept,
    keptIndex,
    forced: records.some((record) => record.forced),
  };
}
