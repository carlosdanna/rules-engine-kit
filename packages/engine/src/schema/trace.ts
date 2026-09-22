import { z } from 'zod';
import { TRACE_SCHEMA_VERSION } from '../version';
import { FactRead } from './condition';
import { Json } from './json';
import {
  Citation,
  Phase,
  RollId,
  RollMode,
  RollModeGrant,
  RollTarget,
  StackPolicy,
} from './primitives';
import { RuleProvenance } from './rule';
import { Expiry, TimePoint } from './time';

export const StateDelta = z.strictObject({
  path: z.string().min(1),
  from: Json,
  to: Json,
});
export type StateDelta = z.infer<typeof StateDelta>;

/** Why a selected rule did not fire. `failedAt` is a JSON pointer into the condition tree. */
export const SkipReason = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('conditionFalse'), failedAt: z.string().min(1) }),
  z.strictObject({ kind: z.literal('disabledByLayer'), layer: z.string().min(1) }),
  z.strictObject({ kind: z.literal('supersededByLayer'), layer: z.string().min(1) }),
  z.strictObject({ kind: z.literal('haltedEarlier'), byRuleKey: z.string().min(1) }),
]);
export type SkipReason = z.infer<typeof SkipReason>;

/**
 * A numeric contribution as the trace records it: the policy has run and any dice have
 * been rolled, so `value` is a number. The engine-side form it came from is
 * `PendingModifier` (`src/stacking/`); the authored form is the `addModifier` effect, whose
 * `modifierType` this keeps the name of (ADR-0014 fixes these names, ADR-0019 closes Q20).
 */
export const AppliedModifier = z.strictObject({
  ruleKey: z.string().min(1),
  modifierType: z.string().min(1),
  stackKey: z.string().min(1).optional(),
  policy: StackPolicy,
  value: z.number().int(),
  /** Present when the modifier was a dice expression, so "+3 bless" can show its d4. */
  rolled: z.strictObject({ expr: z.string().min(1), dice: z.array(z.number().int()) }).optional(),
  /**
   * The fact path the value was read from, when the rule named one rather than a number
   * (ADR-0021), so a trace can say "+3 ability (actor.abilityMod.str)" (FR-14).
   */
  fromFact: z.string().min(1).optional(),
});
export type AppliedModifier = z.infer<typeof AppliedModifier>;

export const DroppedModifier = z.strictObject({
  modifier: AppliedModifier,
  policy: StackPolicy,
  beatenBy: z.string().min(1).optional(),
});
export type DroppedModifier = z.infer<typeof DroppedModifier>;

export const CompareResult = z.enum(['hit', 'miss', 'success', 'failure']);
export type CompareResult = z.infer<typeof CompareResult>;

/** Every event carries where it happened; `seq` is assigned by the trace builder. */
const traceEventBase = {
  seq: z.number().int().nonnegative(),
  stepId: z.string().min(1),
  round: z.number().int().positive(),
  phase: Phase,
};

/**
 * A flat, ordered, discriminated union (ADR-0010, event list revised by ADR-0014). The
 * load-bearing rule: **every enabled rule selected for a phase emits exactly one `rule`
 * event, whether or not it fired** (FR-14), which is what makes `explain()` a pure lookup
 * rather than a re-evaluation (FR-15).
 *
 * There is no `phaseStart` event: the phase list is fixed, so a viewer renders all eight
 * headers and groups events by `(stepId, phase)`.
 */
export const TraceEvent = z.discriminatedUnion('kind', [
  z.strictObject({
    ...traceEventBase,
    kind: z.literal('rule'),
    ruleKey: z.string().min(1),
    status: z.enum(['fired', 'skipped', 'disabled']),
    reason: SkipReason.optional(),
    /** `null` when the rule was never evaluated, e.g. disabled by a layer. */
    conditionResult: z.boolean().nullable(),
    /** In read order, with values — not a static scan of the condition tree (ADR-0013). */
    factsRead: z.array(FactRead),
    deltas: z.array(StateDelta),
    citation: Citation,
    provenance: RuleProvenance,
  }),
  z.strictObject({
    ...traceEventBase,
    kind: z.literal('roll'),
    rollId: RollId,
    target: RollTarget,
    mode: RollMode,
    modeInputs: z.array(z.strictObject({ ruleKey: z.string().min(1), mode: RollModeGrant })),
    /** The pool as first rolled: two entries under advantage or disadvantage. */
    dice: z.array(z.number().int()).min(1),
    transforms: z.array(
      z.strictObject({
        ruleKey: z.string().min(1),
        kind: z.string().min(1),
        /** The die the transform acted on, after any clamp. */
        dieIndex: z.number().int().nonnegative(),
        from: z.number().int(),
        to: z.number().int(),
        /**
         * The selector named a die outside the pool and was clamped into it. ADR-0011
         * requires the clamp to be visible, and a field on the transform that clamped is
         * where a reader of the roll will look (ADR-0019, closing Q19).
         */
        clamped: z.boolean(),
      }),
    ),
    /** The pool the keep runs against — transforms act before the keep (ADR-0011). */
    diceAfterTransforms: z.array(z.number().int()).min(1),
    kept: z.number().int(),
    keptIndex: z.number().int().nonnegative(),
    forced: z.boolean(),
    modifiers: z.array(AppliedModifier),
    dropped: z.array(DroppedModifier),
    total: z.number().int(),
  }),
  z.strictObject({
    ...traceEventBase,
    kind: z.literal('compare'),
    /** `null` when nothing was rolled — a passive score, or an automatic hit. */
    rollId: RollId.nullable(),
    target: RollTarget,
    total: z.number().int(),
    dc: z.number().int(),
    result: CompareResult,
  }),
  z.strictObject({
    ...traceEventBase,
    kind: z.literal('stacking'),
    /**
     * Non-roll derived values only — effective AC, damage. Rolls carry their own (ADR-0006).
     * A bare registered fact path: the actor is the field below, not part of the string
     * (ADR-0019, closing Q17).
     */
    target: z.string().min(1),
    /** Whose value this is, so two actors' `actor.ac.effective` are distinguishable. */
    actorId: z.string().min(1),
    applied: z.array(AppliedModifier),
    dropped: z.array(DroppedModifier),
  }),
  z.strictObject({
    ...traceEventBase,
    kind: z.literal('effectApplied'),
    effectId: z.string().min(1),
    sourceRuleKey: z.string().min(1),
    onActorId: z.string().min(1),
    /** Resolved here, so the scheduled end is visible the moment the effect lands. */
    expiresAt: Expiry,
  }),
  z.strictObject({
    ...traceEventBase,
    kind: z.literal('expiry'),
    effectId: z.string().min(1),
    sourceRuleKey: z.string().min(1),
    /** Anchored to the source, not the target, and that is observable (ADR-0012). */
    at: TimePoint,
  }),
  z.strictObject({
    ...traceEventBase,
    kind: z.literal('event'),
    event: z.string().min(1),
    data: Json.optional(),
  }),
]);
export type TraceEvent = z.infer<typeof TraceEvent>;

/** Distributive, unlike `Omit<TraceEvent, 'seq'>`, which collapses the union (ADR-0014). */
export type TraceEventInput<T = TraceEvent> = T extends TraceEvent ? Omit<T, 'seq'> : never;

export const Trace = z.strictObject({
  traceSchemaVersion: z.literal(TRACE_SCHEMA_VERSION),
  events: z.array(TraceEvent),
});
export type Trace = z.infer<typeof Trace>;

/** Answers "why / why not" for one rule, by lookup over a stored trace (FR-15). */
export const Explanation = z.strictObject({
  ruleKey: z.string().min(1),
  /** `false` answers "why not" on its own: the rule was not in the profile at all. */
  inProfile: z.boolean(),
  citation: Citation.optional(),
  occurrences: z.array(
    z.strictObject({
      stepId: z.string().min(1),
      phase: Phase,
      status: z.enum(['fired', 'skipped', 'disabled']),
      reason: SkipReason.optional(),
      factsRead: z.array(FactRead),
    }),
  ),
  narrative: z.string(),
});
export type Explanation = z.infer<typeof Explanation>;
