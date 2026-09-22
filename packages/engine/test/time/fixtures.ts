/**
 * Timeline fixtures for the time tests. These are fixtures, not content: real scenarios
 * live in `scenarios/` and are checked against the SRD.
 */

import type { Step } from '../../src/schema';

/** A two-actor initiative order: the cleric always acts before the fighter. */
export function alternating(rounds: number): Step[] {
  const steps: Step[] = [];
  for (let round = 1; round <= rounds; round++) {
    for (const actorId of ['cleric', 'fighter']) {
      steps.push({ id: `r${round}-${actorId}`, round, actorId, action: null });
    }
  }
  return steps;
}
