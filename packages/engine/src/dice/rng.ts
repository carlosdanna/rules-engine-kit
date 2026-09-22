/**
 * The seeded stream. Lifted from `spike/rng.ts`, which replaced
 * `@dice-roller/rpg-dice-roller`: its `NumberGenerator.generator` is a process-wide
 * singleton and seeding means mutating it, which ADR-0002 and NFR-1 rule out — and the
 * two runs behind `/compare` (FR-16) would have shared one stream
 * (`docs/spike-notes.md` §3). No dependency, so it runs in the browser too (NFR-3).
 *
 * **The seed → stream mapping is part of the reproducibility contract.** Changing either
 * function below changes the dice for every stored evaluation, so it must come with an
 * `ENGINE_VERSION` bump (VR-7). `test/dice/roller.test.ts` pins the first values against
 * a known seed so the change cannot pass unnoticed.
 */

/** A float in `[0, 1)`. */
export type Rng = () => number;

/** FNV-1a, so `opts.seed` can stay a human-readable string. */
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
