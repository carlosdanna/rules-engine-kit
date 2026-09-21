import { z } from 'zod';

/**
 * Time is an ordered point, and expiry is a comparison against it rather than a
 * decrement (ADR-0007, kept by ADR-0012). `src/time/` owns the ordering.
 */
export const Edge = z.enum(['start', 'end']);
export type Edge = z.infer<typeof Edge>;

export const TimePoint = z.strictObject({
  round: z.number().int().positive(),
  /** Index into `situation.timeline`, so two turns in the same round still order. */
  stepIndex: z.number().int().nonnegative(),
  edge: Edge,
});
export type TimePoint = z.infer<typeof TimePoint>;

/**
 * Whose turn a duration is anchored to. Rules are authored before a situation exists,
 * so the anchor is symbolic in content and resolved per evaluation (ADR-0012).
 */
export const AnchorRef = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('source') }),
  z.strictObject({ kind: z.literal('target') }),
  z.strictObject({ kind: z.literal('actor'), actorId: z.string().min(1) }),
]);
export type AnchorRef = z.infer<typeof AnchorRef>;

/**
 * Every non-instant, non-permanent duration names an anchor turn and an edge, because
 * "10 rounds" alone cannot be resolved to a `TimePoint` (ADR-0012).
 *
 * Convention for time spans: *N* minutes is `{ kind: 'rounds', rounds: N * 10,
 * anchor: { kind: 'source' }, edge: 'end' }`. Neither SRD states which edge a time span
 * ends on, so every rule using one carries an `interpretation` note saying so.
 */
export const Duration = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('instant') }),
  z.strictObject({
    kind: z.literal('untilTurn'),
    anchor: AnchorRef,
    edge: Edge,
    /** 0 = the anchor's turn in this round. */
    afterRounds: z.number().int().nonnegative(),
  }),
  z.strictObject({
    kind: z.literal('rounds'),
    rounds: z.number().int().positive(),
    anchor: AnchorRef,
    edge: Edge,
  }),
  z.strictObject({ kind: z.literal('permanent') }),
]);
export type Duration = z.infer<typeof Duration>;

/**
 * A duration resolved against the whole timeline at application time. Three-way, because
 * `null` used to mean both "permanent" and "the anchor turn is not in this timeline" —
 * and short demo timelines produce the second routinely (ADR-0012).
 */
export const Expiry = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('at'), point: TimePoint }),
  z.strictObject({ kind: z.literal('permanent') }),
  z.strictObject({
    kind: z.literal('beyondTimeline'),
    wouldExpireInRound: z.number().int().positive(),
  }),
]);
export type Expiry = z.infer<typeof Expiry>;

/**
 * A condition applied to an actor for a duration, with its end already resolved.
 * `applyCondition` is the only duration-bearing effect in the catalogue, so rules that
 * read `actor.conditions` are what a live effect actually does — e.g. Bless applies
 * `blessed`, and a separate `modifiers`-phase rule adds the d4 while it is present.
 */
export const ActiveEffect = z.strictObject({
  id: z.string().min(1),
  sourceRuleKey: z.string().min(1),
  /** The actor carrying it — not necessarily the anchor actor (ADR-0012). */
  actorId: z.string().min(1),
  condition: z.string().min(1),
  duration: Duration,
  appliedAt: TimePoint,
  expiresAt: Expiry,
});
export type ActiveEffect = z.infer<typeof ActiveEffect>;
