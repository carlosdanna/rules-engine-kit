import { describe, expect, it } from 'vitest';
import { createRoller, ForcedRollError, hashSeed } from '../../src/dice';

const ROLL_ID = 'r1-fighter/attack:fighter';

function drawD20(seed: string, count: number): number[] {
  const roller = createRoller({ seed });
  return Array.from({ length: count }, () => roller.roll(ROLL_ID, 20).value);
}

describe('determinism (NFR-1)', () => {
  it('gives the same sequence for the same seed, across separate rollers', () => {
    expect(drawD20('demo-seed', 12)).toEqual(drawD20('demo-seed', 12));
  });

  it('gives the same log, not just the same values', () => {
    const a = createRoller({ seed: 'demo-seed' });
    const b = createRoller({ seed: 'demo-seed' });
    for (const roller of [a, b]) {
      roller.roll(ROLL_ID, 20);
      roller.roll(ROLL_ID, 20);
      roller.roll(`${ROLL_ID}:bless`, 4);
    }
    expect(a.log).toEqual(b.log);
  });

  it('diverges for a different seed', () => {
    expect(drawD20('demo-seed', 8)).not.toEqual(drawD20('other-seed', 8));
  });

  it('pins the seed → stream mapping', () => {
    // This mapping is part of the reproducibility contract (docs/spike-notes.md §3):
    // every stored evaluation replays through it. If this assertion fails, the change is
    // only acceptable alongside an ENGINE_VERSION bump (VR-7) — never as a silent fix.
    expect(hashSeed('demo-seed')).toBe(1755339648);
    expect(drawD20('demo-seed', 8)).toEqual([16, 10, 19, 12, 18, 10, 8, 18]);
  });

  it('draws within [1, sides] for every die it mints', () => {
    const roller = createRoller({ seed: 'range-check' });
    for (const sides of [4, 6, 8, 10, 12, 20, 100]) {
      for (let i = 0; i < 200; i++) {
        const { value } = roller.roll(`${ROLL_ID}:d${sides}`, sides);
        expect(value).toBeGreaterThanOrEqual(1);
        expect(value).toBeLessThanOrEqual(sides);
      }
    }
  });
});

describe('roll ids and channels', () => {
  it('counts independently per roll id, so channels cannot shift each other', () => {
    const roller = createRoller({ seed: 'demo-seed' });
    roller.roll(ROLL_ID, 20);
    const bless = roller.roll(`${ROLL_ID}:bless`, 4);
    const second = roller.roll(ROLL_ID, 20);
    expect(bless.index).toBe(0);
    expect(second.index).toBe(1);
  });

  it('records every die in order', () => {
    const roller = createRoller({ seed: 'demo-seed' });
    roller.roll(ROLL_ID, 20);
    roller.roll(`${ROLL_ID}:reroll`, 20);
    expect(roller.log.map((record) => record.rollId)).toEqual([ROLL_ID, `${ROLL_ID}:reroll`]);
  });
});

describe('forced rolls (FR-13)', () => {
  it('substitutes per roll id, in order, and marks the record forced', () => {
    const roller = createRoller({
      seed: 'demo-seed',
      forcedRolls: { [ROLL_ID]: [4, 16], [`${ROLL_ID}:reroll`]: [11] },
    });
    expect(roller.roll(ROLL_ID, 20)).toMatchObject({ value: 4, index: 0, forced: true });
    expect(roller.roll(ROLL_ID, 20)).toMatchObject({ value: 16, index: 1, forced: true });
    expect(roller.roll(`${ROLL_ID}:reroll`, 20)).toMatchObject({ value: 11, forced: true });
  });

  it('falls through to the stream once a queue runs out', () => {
    const roller = createRoller({ seed: 'demo-seed', forcedRolls: { [ROLL_ID]: [4] } });
    expect(roller.roll(ROLL_ID, 20).forced).toBe(true);
    expect(roller.roll(ROLL_ID, 20)).toMatchObject({ forced: false, value: 16 });
  });

  it('does not consume the stream for a forced die', () => {
    // A fixture pins one channel and lets the rest fall out of the seed, so the dice it
    // did not force must not depend on how many it did.
    const forced = createRoller({ seed: 'demo-seed', forcedRolls: { [ROLL_ID]: [4, 16] } });
    forced.roll(ROLL_ID, 20);
    forced.roll(ROLL_ID, 20);
    expect(forced.roll(`${ROLL_ID}:bless`, 20).value).toBe(16);
    expect(drawD20('demo-seed', 1)).toEqual([16]);
  });

  it('rejects a forced value that is not a face of the die', () => {
    const roller = createRoller({ seed: 'demo-seed', forcedRolls: { [ROLL_ID]: [25] } });
    expect(() => roller.roll(ROLL_ID, 20)).toThrow(ForcedRollError);
  });
});
