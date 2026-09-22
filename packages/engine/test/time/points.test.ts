import { describe, expect, it } from 'vitest';
import type { TimePoint } from '../../src/schema';
import { comparePoints, formatTimePoint, pointsEqual } from '../../src/time';

const point = (round: number, stepIndex: number, edge: 'start' | 'end'): TimePoint => ({
  round,
  stepIndex,
  edge,
});

describe('comparePoints — ordering (ADR-0012)', () => {
  it('orders by round before anything else', () => {
    expect(comparePoints(point(1, 99, 'end'), point(2, 0, 'start'))).toBeLessThan(0);
  });

  it('orders two turns in the same round by step index', () => {
    expect(comparePoints(point(3, 4, 'end'), point(3, 5, 'start'))).toBeLessThan(0);
  });

  it('puts the start of a step before its end', () => {
    expect(comparePoints(point(3, 4, 'start'), point(3, 4, 'end'))).toBeLessThan(0);
  });

  it('is zero for the same point, which is what pointsEqual reads', () => {
    expect(comparePoints(point(3, 4, 'end'), point(3, 4, 'end'))).toBe(0);
    expect(pointsEqual(point(3, 4, 'end'), point(3, 4, 'end'))).toBe(true);
    expect(pointsEqual(point(3, 4, 'end'), point(3, 4, 'start'))).toBe(false);
  });

  it('is antisymmetric, so a sort over it is stable', () => {
    const a = point(2, 1, 'start');
    const b = point(2, 1, 'end');
    expect(Math.sign(comparePoints(a, b))).toBe(-Math.sign(comparePoints(b, a)));
  });
});

describe('formatTimePoint — narrative (NFR-7)', () => {
  it('names the edge, the round and the step', () => {
    expect(formatTimePoint(point(11, 20, 'end'))).toBe('the end of round 11 (step 20)');
  });
});
