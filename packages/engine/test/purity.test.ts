/**
 * `packages/engine/src` has no I/O, no clock, no global randomness and no framework imports
 * (ADR-0002). That is an M1 exit criterion, and until this file existed it was a claim
 * nothing checked — `pnpm check` could go green with `Date.now()` sitting in the evaluator.
 *
 * The boundary is `src/`, not the package: `cli.ts` reads YAML packs off a disk and this
 * test reads source files, both outside it (ADR-0020). Keeping `src/` clean is also what
 * lets the engine run in a browser (NFR-3).
 *
 * This is a lint, so it is deliberately blunt: it matches text, not semantics. A false
 * positive is a comment reworded; a false negative is a determinism bug that reaches a
 * stored evaluation, which VR-7 exists because we cannot take back.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  { pattern: /\bfrom\s+'(node:)?(fs|fs\/promises|path|os|child_process)'/, why: 'imports I/O' },
  { pattern: /\bDate\.now\(|\bnew Date\(|\bperformance\.now\(/, why: 'reads a clock' },
  { pattern: /\bMath\.random\(/, why: 'uses global randomness' },
  { pattern: /\bfrom\s+'(next|drizzle-orm|better-sqlite3)/, why: 'imports a framework' },
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
  });
}

const files = sourceFiles(SRC);

describe('engine purity (NFR-1, ADR-0002, ADR-0020)', () => {
  it('finds the source files it is meant to be checking', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(FORBIDDEN)('no file under src/ $why', ({ pattern }) => {
    const offenders = files.filter((file) => pattern.test(readFileSync(file, 'utf8')));
    expect(offenders.map((file) => relative(SRC, file))).toEqual([]);
  });

  it('keeps the seeded roller as the only source of dice', () => {
    // Narrower than "no Math.random": the rule is that randomness is *injected*, so an
    // `Rng` built anywhere but `dice/rng.ts` would be a second stream nobody seeded.
    const offenders = files.filter(
      (file) =>
        /\bmulberry32\(/.test(readFileSync(file, 'utf8')) &&
        !file.endsWith(join('dice', 'rng.ts')) &&
        !file.endsWith(join('dice', 'roller.ts')),
    );
    expect(offenders.map((file) => relative(SRC, file))).toEqual([]);
  });
});
