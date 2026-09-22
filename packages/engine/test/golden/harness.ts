/**
 * Turns a case directory into an evaluation.
 *
 * A golden case is data, not code: `cases.test.ts` discovers every folder under `cases/`
 * and runs it, so a new case is a new directory. That is what NFR-4's "a golden test for
 * every template × profile" needs to be affordable in M2, when there are many of them
 * rather than two.
 *
 * Packs are loaded through `loadPacks` from `../../cli`, the same function
 * `pnpm engine run` uses, so a case that passes here replays identically from a terminal
 * and there is only ever one answer to what a pack's YAML means.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPacks } from '../../cli';
import { evaluate } from '../../src/evaluator';
import { resolveProfile } from '../../src/resolver';
import type { EvaluationResult, Outcome, RollId } from '../../src/schema';
import { Situation } from '../../src/schema';

/** Resolved from this file, not `process.cwd()`, so the suite runs from any directory. */
export const CASES_DIR = join(dirname(fileURLToPath(import.meta.url)), 'cases');

/** `case.json`: everything about the run that is not the situation itself. */
type CaseManifest = {
  /** What rules claim this case pins down. Used as the test name. */
  description: string;
  /** Pack directories relative to the case folder, base first (ADR-0018). */
  profile: string[];
  seed: string;
};

export type GoldenCase = {
  name: string;
  dir: string;
  manifest: CaseManifest;
  situation: Situation;
  /** Dice pinned by roll id (ADR-0011); empty when the case runs off the seed alone. */
  forcedRolls: Record<RollId, number[]>;
  /** Hand-derived from the SRD. A partial `Outcome`, matched with `toMatchObject`. */
  expected: Partial<Outcome>;
};

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readOptionalJson(path: string): unknown {
  try {
    return readJson(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

export function loadCase(name: string): GoldenCase {
  const dir = join(CASES_DIR, name);
  const manifest = readJson(join(dir, 'case.json')) as CaseManifest;
  const forced = readOptionalJson(join(dir, 'forced.json'));

  return {
    name,
    dir,
    manifest,
    // Parsed here as well as inside `evaluate`, so a malformed situation fails as the case
    // that owns it rather than somewhere in the middle of a run.
    situation: Situation.parse(readJson(join(dir, 'situation.json'))),
    forcedRolls: (forced ?? {}) as Record<RollId, number[]>,
    expected: readJson(join(dir, 'expected.json')) as Partial<Outcome>,
  };
}

/** Every directory under `cases/` holding a `case.json`, in name order. */
export function discoverCases(): GoldenCase[] {
  return readdirSync(CASES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map(loadCase);
}

export function runCase(golden: GoldenCase): EvaluationResult {
  const { packs, facts } = loadPacks(
    golden.manifest.profile.map((dir) => resolve(golden.dir, dir)),
  );

  return evaluate(golden.situation, resolveProfile(packs), {
    seed: golden.manifest.seed,
    facts,
    forcedRolls: golden.forcedRolls,
  });
}
