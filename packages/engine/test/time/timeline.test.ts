import { describe, expect, it } from 'vitest';
import type { Step } from '../../src/schema';
import { buildTimelineIndex } from '../../src/time';
import { alternating } from './fixtures';

describe('buildTimelineIndex — actor × round → stepIndex (ADR-0012)', () => {
  const timeline = buildTimelineIndex(alternating(12));

  it("finds the cleric's turn in round 11 at step index 20", () => {
    // 12 rounds × 2 actors, cleric first: round 11's cleric is index (11 - 1) * 2 = 20.
    expect(timeline.stepIndexOf('cleric', 11)).toBe(20);
    expect(timeline.stepIndexOf('fighter', 11)).toBe(21);
  });

  it('returns undefined for a round the actor has no turn in', () => {
    expect(timeline.stepIndexOf('cleric', 13)).toBeUndefined();
    expect(timeline.stepIndexOf('goblin', 1)).toBeUndefined();
  });

  it('reports the last round of the timeline', () => {
    expect(timeline.lastRound).toBe(12);
  });

  it('keeps the first of two turns an actor takes in one round', () => {
    const steps: Step[] = [
      { id: 'a', round: 1, actorId: 'fighter', action: null },
      { id: 'b', round: 1, actorId: 'fighter', action: null },
    ];
    expect(buildTimelineIndex(steps).stepIndexOf('fighter', 1)).toBe(0);
  });

  it('throws rather than returning undefined for a step index out of range', () => {
    expect(() => timeline.stepAt(99)).toThrow(RangeError);
    expect(timeline.stepAt(20).id).toBe('r11-cleric');
  });
});
