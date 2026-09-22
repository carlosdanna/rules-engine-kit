/**
 * Ordering over `(round, stepIndex, edge)` time points (ADR-0007, carried into ADR-0012).
 *
 * Expiry is a *comparison* against a resolved point, never a decrement on a counter, so
 * removing an effect is order-independent and the trace can state up front when it ends.
 * Everything here is total and pure: no clock is consulted (ADR-0002, NFR-1).
 */

import type { Edge, TimePoint } from '../schema';

/** `start` precedes `end` within one step. */
const EDGE_ORDER: Record<Edge, number> = { start: 0, end: 1 };

export function comparePoints(a: TimePoint, b: TimePoint): number {
  if (a.round !== b.round) return a.round - b.round;
  // `stepIndex` and not `actorId`: two turns in the same round still order (ADR-0005).
  if (a.stepIndex !== b.stepIndex) return a.stepIndex - b.stepIndex;
  return EDGE_ORDER[a.edge] - EDGE_ORDER[b.edge];
}

export function pointsEqual(a: TimePoint, b: TimePoint): boolean {
  return comparePoints(a, b) === 0;
}

/**
 * For the narrative renderer (NFR-7). Deliberately does not name the anchor actor — the
 * caller holds the timeline and ADR-0012 requires the *actor* be named, which this module
 * cannot know from a point alone.
 */
export function formatTimePoint(point: TimePoint): string {
  return `the ${point.edge} of round ${point.round} (step ${point.stepIndex})`;
}
