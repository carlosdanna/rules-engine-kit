import { describe, expect, it } from 'vitest';
import type { ActiveEffect, Duration, Expiry, TimePoint } from '../../src/schema';
import { buildTimelineIndex, isExpiredAt, resolveExpiry, sweepExpired } from '../../src/time';
import { alternating } from './fixtures';

const timeline = buildTimelineIndex(alternating(12));
const appliedAt: TimePoint = { round: 1, stepIndex: 0, edge: 'start' };

const resolve = (duration: Duration, anchorActorId: string | null = 'cleric'): Expiry =>
  resolveExpiry({ duration, appliedAt, anchorActorId, timeline });

describe('resolveExpiry — durations resolve against the whole timeline (ADR-0012)', () => {
  it('ends Bless at the end of the caster’s turn in round 11: 1 + 10 rounds, step index 20', () => {
    // docs/spike-notes.md §2.2, hand-derived: the cleric casts on round 1 and a 10-round
    // duration anchored to the source's turn end lands on the cleric's round-11 step.
    expect(
      resolve({ kind: 'rounds', rounds: 10, anchor: { kind: 'source' }, edge: 'end' }),
    ).toEqual({
      kind: 'at',
      point: { round: 11, stepIndex: 20, edge: 'end' },
    });
  });

  it('resolves untilTurn with afterRounds 0 to the anchor’s turn in this round', () => {
    expect(
      resolve({ kind: 'untilTurn', anchor: { kind: 'source' }, edge: 'start', afterRounds: 0 }),
    ).toEqual({ kind: 'at', point: { round: 1, stepIndex: 0, edge: 'start' } });
  });

  it('anchors to the actor named, not to the applying actor', () => {
    expect(
      resolve(
        { kind: 'rounds', rounds: 10, anchor: { kind: 'actor', actorId: 'fighter' }, edge: 'end' },
        'fighter',
      ),
    ).toEqual({ kind: 'at', point: { round: 11, stepIndex: 21, edge: 'end' } });
  });

  it('reports beyondTimeline when the anchor has no turn in the target round', () => {
    // 20 rounds past a 12-round timeline: "outlives this run" is not "permanent".
    expect(
      resolve({ kind: 'rounds', rounds: 20, anchor: { kind: 'source' }, edge: 'end' }),
    ).toEqual({
      kind: 'beyondTimeline',
      wouldExpireInRound: 21,
    });
  });

  it('passes permanent straight through and needs no anchor', () => {
    expect(resolve({ kind: 'permanent' }, null)).toEqual({ kind: 'permanent' });
  });

  it('ends an instant effect at the end of the step that applied it', () => {
    expect(resolve({ kind: 'instant' }, null)).toEqual({
      kind: 'at',
      point: { round: 1, stepIndex: 0, edge: 'end' },
    });
  });

  it('refuses a time-span duration with no resolved anchor', () => {
    expect(() =>
      resolve({ kind: 'rounds', rounds: 1, anchor: { kind: 'source' }, edge: 'end' }, null),
    ).toThrow(/needs a resolved anchor/);
  });
});

describe('isExpiredAt — expiry is a comparison, not a decrement (ADR-0012)', () => {
  const at = (point: TimePoint): Expiry => ({ kind: 'at', point });
  const end11: TimePoint = { round: 11, stepIndex: 20, edge: 'end' };

  it('fires at exactly its point', () => {
    expect(isExpiredAt(at(end11), end11)).toBe(true);
  });

  it('does not fire at the matching edge of an earlier step', () => {
    expect(isExpiredAt(at(end11), { round: 11, stepIndex: 19, edge: 'end' })).toBe(false);
  });

  it('ignores the other edge, so upkeep sweeps start and expire sweeps end', () => {
    expect(isExpiredAt(at(end11), { round: 11, stepIndex: 20, edge: 'start' })).toBe(false);
  });

  it('still fires later when its point has already passed, rather than leaking forever', () => {
    expect(isExpiredAt(at(end11), { round: 12, stepIndex: 22, edge: 'end' })).toBe(true);
  });

  it('never expires a permanent or beyondTimeline effect', () => {
    expect(isExpiredAt({ kind: 'permanent' }, end11)).toBe(false);
    expect(isExpiredAt({ kind: 'beyondTimeline', wouldExpireInRound: 21 }, end11)).toBe(false);
  });
});

describe('sweepExpired — partitions so every removal can be traced (FR-14)', () => {
  const effect = (id: string, expiresAt: Expiry): ActiveEffect => ({
    id,
    sourceRuleKey: 'spell.bless.duration',
    actorId: 'fighter',
    condition: 'blessed',
    duration: { kind: 'rounds', rounds: 10, anchor: { kind: 'source' }, edge: 'end' },
    appliedAt,
    expiresAt,
  });

  it('separates the expired from the survivors and preserves order', () => {
    const now: TimePoint = { round: 11, stepIndex: 20, edge: 'end' };
    const { kept, expired } = sweepExpired(
      [
        effect('eff-1', { kind: 'at', point: now }),
        effect('eff-2', { kind: 'permanent' }),
        effect('eff-3', { kind: 'at', point: { round: 12, stepIndex: 22, edge: 'end' } }),
      ],
      now,
    );
    expect(expired.map((e) => e.id)).toEqual(['eff-1']);
    expect(kept.map((e) => e.id)).toEqual(['eff-2', 'eff-3']);
  });
});
