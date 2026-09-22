/**
 * Seeded dice and forced results (FR-13). Owns steps 1–4 of ADR-0011's roll order — mode,
 * pool, transforms on a chosen die, keep — as pure functions over an injected roller, and
 * returns them shaped for the `roll` trace event. Steps 5 (numeric modifiers and their
 * stacking policies) and the rule-priority selection of transforms belong to the phase
 * loop and `src/stacking/`.
 */

export {
  type AppliedTransform,
  applyTransform,
  D20_SIDES,
  type D20Roll,
  keepDie,
  poolSize,
  type RolledPool,
  type RollModeInput,
  resolveD20Roll,
  resolveRollMode,
  rollPool,
  type TransformRequest,
} from './d20';
export {
  type DiceNotation,
  DiceNotationError,
  formatDiceNotation,
  fromDiceExpr,
  parseDiceNotation,
} from './notation';
export { hashSeed, mulberry32, type Rng } from './rng';
export { createRoller, ForcedRollError, type Roller, type RollRecord } from './roller';
export { makeRollId, REROLL_CHANNEL, withChannel } from './rollId';
