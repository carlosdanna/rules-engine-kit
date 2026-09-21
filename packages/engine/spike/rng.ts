/**
 * SPIKE — throwaway seeded roller. ~40 lines, no dependencies, injected not global.
 * See docs/spike-notes.md for why @dice-roller/rpg-dice-roller was not used.
 */

export type Rng = () => number; // float in [0, 1)

/** 32-bit string hash so `opts.seed` can stay a human-readable string. */
export function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type RollRecord = { id: string; sides: number; value: number; forced: boolean };

/**
 * SPIKE FINDING: forced rolls keyed by step id alone (architecture.md) are
 * ambiguous once a step rolls on more than one channel — an attack d20 pair and
 * a Bless d4 land in the same flat array. Keyed by a roll id here instead:
 *   `<stepId>/<channel>#<n>`  e.g. 'r1-fighter/attack:fighter#0'
 */
export class Roller {
  private rng: Rng;
  private counters = new Map<string, number>();
  readonly log: RollRecord[] = [];

  constructor(
    readonly seed: string,
    private forced: Record<string, number[]> = {},
  ) {
    this.rng = mulberry32(hashSeed(seed));
  }

  roll(stepId: string, channel: string, sides: number): RollRecord {
    const key = `${stepId}/${channel}`;
    const n = this.counters.get(key) ?? 0;
    this.counters.set(key, n + 1);
    const id = `${key}#${n}`;
    const queue = this.forced[key];
    const forcedValue = queue?.[n];
    const value = forcedValue ?? 1 + Math.floor(this.rng() * sides);
    const rec: RollRecord = { id, sides, value, forced: forcedValue !== undefined };
    this.log.push(rec);
    return rec;
  }
}
