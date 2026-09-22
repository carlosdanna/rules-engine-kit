/**
 * Resolving a `Duration` to an `Expiry` at application time, and the sweep that removes
 * effects whose time has come (ADR-0012, FR-7).
 *
 * Two things this module deliberately does not do. It never sees `$actor`/`$target`: the
 * caller resolves the `AnchorRef` to a concrete actor id first, because symbolic refs are
 * a property of the *step*, not of time. And it never decrements: an `Expiry` is resolved
 * once, against the whole timeline, and every later question is a comparison.
 */

import type { ActiveEffect, Duration, Expiry, TimePoint } from '../schema';
import { comparePoints } from './points';
import type { TimelineIndex } from './timeline';

export type ResolveExpiryArgs = {
  duration: Duration;
  appliedAt: TimePoint;
  /** Already resolved from the duration's `AnchorRef`; `null` only for instant/permanent. */
  anchorActorId: string | null;
  timeline: TimelineIndex;
};

export function resolveExpiry(args: ResolveExpiryArgs): Expiry {
  const { duration, appliedAt, anchorActorId, timeline } = args;

  if (duration.kind === 'permanent') {
    return { kind: 'permanent' };
  }

  // An instant effect still becomes an `ActiveEffect` and is swept by the `expire` phase of
  // the step that applied it, so it produces a visible `effectApplied`/`expiry` pair. Not
  // materialising it would make `applyCondition` with `instant` a silent no-op (FR-17).
  if (duration.kind === 'instant') {
    return {
      kind: 'at',
      point: { round: appliedAt.round, stepIndex: appliedAt.stepIndex, edge: 'end' },
    };
  }

  if (anchorActorId === null) {
    throw new Error(`a '${duration.kind}' duration needs a resolved anchor actor (ADR-0012)`);
  }

  const rounds = duration.kind === 'untilTurn' ? duration.afterRounds : duration.rounds;
  const targetRound = appliedAt.round + rounds;
  const stepIndex = timeline.stepIndexOf(anchorActorId, targetRound);

  // The anchor never takes a turn in that round within this timeline. "Outlives the run" is
  // a different answer from "permanent", and ADR-0012 made `Expiry` three-way to say so.
  if (stepIndex === undefined) {
    return { kind: 'beyondTimeline', wouldExpireInRound: targetRound };
  }

  return { kind: 'at', point: { round: targetRound, stepIndex, edge: duration.edge } };
}

/**
 * The sweep predicate. The edge filter is what splits the work between the two phases:
 * `upkeep` sweeps `start`, `expire` sweeps `end`, and nothing else removes effects by time.
 *
 * `<=` rather than `===` on purpose. A point can resolve to a step that has already passed
 * — `afterRounds: 0` anchored to an actor who acted earlier this round — and an effect like
 * that must still be swept at the next sweep of its edge instead of leaking forever.
 */
export function isExpiredAt(expiry: Expiry, now: TimePoint): boolean {
  return (
    expiry.kind === 'at' && expiry.point.edge === now.edge && comparePoints(expiry.point, now) <= 0
  );
}

/** Partitions rather than filters, because the caller must trace every removal (FR-14). */
export function sweepExpired(
  effects: readonly ActiveEffect[],
  now: TimePoint,
): { kept: ActiveEffect[]; expired: ActiveEffect[] } {
  const kept: ActiveEffect[] = [];
  const expired: ActiveEffect[] = [];
  for (const effect of effects) {
    (isExpiredAt(effect.expiresAt, now) ? expired : kept).push(effect);
  }
  return { kept, expired };
}
