import { z } from 'zod';
import { TRACE_SCHEMA_VERSION } from '../version';
import { Json } from './json';
import { RollId, RollMode, RollTarget, Semver } from './primitives';
import { ActiveEffect } from './time';
import { AppliedModifier, CompareResult, Trace } from './trace';

/**
 * A number the engine assembled rather than read, with every contributing term, so the
 * viewer can render "10 base + 3 Dex + 2 cover = 15" (ADR-0006, FR-8).
 */
export const DerivedValue = z.strictObject({
  /** A registered derived fact path, e.g. `actor.ac.effective` or `roll.attack.bonus`. */
  path: z.string().min(1),
  actorId: z.string().min(1),
  /**
   * The step this was assembled on. `Outcome.derived` is flat and a twelve-round run
   * derives the same path twelve times, so without this they are distinguishable only by
   * position — and `diffOutcomes` needs a key to align on (FR-16, ADR-0019 closing Q18).
   */
  stepId: z.string().min(1),
  base: z.number().int(),
  terms: z.array(
    z.strictObject({
      source: z.string().min(1),
      ruleKey: z.string().min(1),
      value: z.number().int(),
      modifierType: z.string().min(1),
    }),
  ),
  total: z.number().int(),
});
export type DerivedValue = z.infer<typeof DerivedValue>;

/** The outcome-level summary of a roll; the `roll` trace event carries the dice detail. */
export const RollOutcome = z.strictObject({
  rollId: RollId,
  target: RollTarget,
  mode: RollMode,
  kept: z.number().int(),
  modifiers: z.array(AppliedModifier),
  total: z.number().int(),
  forced: z.boolean(),
});
export type RollOutcome = z.infer<typeof RollOutcome>;

export const CompareOutcome = z.strictObject({
  rollId: RollId.nullable(),
  target: RollTarget,
  total: z.number().int(),
  dc: z.number().int(),
  result: CompareResult,
});
export type CompareOutcome = z.infer<typeof CompareOutcome>;

export const DamageOutcome = z.strictObject({
  actorId: z.string().min(1),
  /**
   * The type dealt, from the weapon that dealt it, or `untyped` for an attack with no
   * weapon behind it (ADR-0025). It is what `target.resistances` is matched against.
   */
  damageType: z.string().min(1),
  amount: z.number().int().nonnegative(),
  hpAfter: z.number().int(),
  /**
   * How much of `amount` fell past 0 and was discarded, normally 0 (ADR-0023). Hit points
   * clamp because `Actor.hpCurrent` is `nonnegative()`, and the SRD's use for the overflow
   * — instant death — is out of scope (ADR-0003). It is reported rather than dropped, on
   * the same principle as a clamped roll transform (ADR-0019): nothing reads it.
   */
  overflow: z.number().int().nonnegative(),
});
export type DamageOutcome = z.infer<typeof DamageOutcome>;

/** One per `Step`, in timeline order (ADR-0005). */
export const StepOutcome = z.strictObject({
  stepId: z.string().min(1),
  round: z.number().int().positive(),
  actorId: z.string().min(1),
  rolls: z.array(RollOutcome),
  comparisons: z.array(CompareOutcome),
  damage: z.array(DamageOutcome),
  /** Set when a `halt` effect ended the step early. */
  halted: z.strictObject({ ruleKey: z.string().min(1), reason: z.string().min(1) }).nullable(),
});
export type StepOutcome = z.infer<typeof StepOutcome>;

export const ActorState = z.strictObject({
  id: z.string().min(1),
  hpCurrent: z.number().int(),
  conditions: z.array(z.string().min(1)),
});
export type ActorState = z.infer<typeof ActorState>;

export const WorldState = z.strictObject({
  actors: z.record(z.string(), ActorState),
  /**
   * Effects still running when the timeline ended. Short demo timelines produce
   * `beyondTimeline` expiries routinely, and reporting them honestly is the point of
   * ADR-0012's three-way `Expiry`.
   */
  activeEffects: z.array(ActiveEffect),
});
export type WorldState = z.infer<typeof WorldState>;

export const EmittedEvent = z.strictObject({
  stepId: z.string().min(1),
  event: z.string().min(1),
  data: Json.optional(),
});
export type EmittedEvent = z.infer<typeof EmittedEvent>;

/**
 * Everything `evaluate` produces besides the trace. The four version and identity fields
 * are stored with the evaluation so a replay is honest about what produced it (VR-7), and
 * they are what `/compare` aligns two runs on (FR-16).
 */
export const Outcome = z.strictObject({
  steps: z.array(StepOutcome),
  finalState: WorldState,
  derived: z.array(DerivedValue),
  events: z.array(EmittedEvent),
  seed: z.string().min(1),
  profileHash: z.string().min(1),
  engineVersion: Semver,
  traceSchemaVersion: z.literal(TRACE_SCHEMA_VERSION),
});
export type Outcome = z.infer<typeof Outcome>;

export const EvaluationResult = z.strictObject({
  outcome: Outcome,
  trace: Trace,
});
export type EvaluationResult = z.infer<typeof EvaluationResult>;
