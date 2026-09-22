/**
 * The actor × round → stepIndex index ADR-0012 requires: resolving a duration needs the
 * whole timeline, not just the step that applied it, because a duration names *an anchor
 * actor's turn* in some later round and that turn may sit anywhere in the order.
 *
 * Built once per evaluation and read many times, so the lookup is a map rather than a scan.
 */

import type { Step } from '../schema';

export type TimelineIndex = {
  readonly steps: readonly Step[];
  /** The anchor actor's turn in that round, or `undefined` when it has none. */
  stepIndexOf(actorId: string, round: number): number | undefined;
  stepAt(stepIndex: number): Step;
  readonly lastRound: number;
};

/** `\u0000` cannot appear in an actor id, so the composite key is unambiguous. */
function key(actorId: string, round: number): string {
  return `${actorId}\u0000${round}`;
}

export function buildTimelineIndex(steps: readonly Step[]): TimelineIndex {
  const byActorRound = new Map<string, number>();
  let lastRound = 0;

  for (const [stepIndex, step] of steps.entries()) {
    const composite = key(step.actorId, step.round);
    // First turn wins: "the anchor's turn in round R" means its first one when an actor
    // acts twice in a round. Last-wins would move an expiry when an unrelated extra turn
    // is added to the timeline.
    if (!byActorRound.has(composite)) {
      byActorRound.set(composite, stepIndex);
    }
    if (step.round > lastRound) {
      lastRound = step.round;
    }
  }

  return {
    steps,
    stepIndexOf: (actorId, round) => byActorRound.get(key(actorId, round)),
    stepAt: (stepIndex) => {
      const step = steps[stepIndex];
      if (step === undefined) {
        throw new RangeError(`no step at index ${stepIndex}`);
      }
      return step;
    },
    lastRound,
  };
}
