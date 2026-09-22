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

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFixtures, loadPacks, loadProfiles, loadTemplates } from '../../cli';
import { evaluate } from '../../src/evaluator';
import { resolveProfile } from '../../src/resolver';
import type { EvaluationResult, Outcome, RollId } from '../../src/schema';
import { Situation } from '../../src/schema';
import { buildFixtureIndex, renderTemplate } from '../../src/templates';

/** Resolved from this file, not `process.cwd()`, so the suite runs from any directory. */
export const CASES_DIR = join(dirname(fileURLToPath(import.meta.url)), 'cases');

/** The seeded content tree, five directories up from `test/golden/`. */
const CONTENT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../content');

/** `case.json`: everything about the run that is not the situation itself. */
type CaseManifest = {
  /** What rules claim this case pins down. Used as the test name. */
  description: string;
  /**
   * Either pack directories relative to the case folder, base first (ADR-0018), or the slug
   * of a profile `content/profiles.yaml` declares (ADR-0026). A template case names the slug,
   * because the slug is also what picks the fixture variant it renders against — saying it
   * twice would let the two disagree.
   */
  profile: string[] | string;
  seed: string;
};

/**
 * `template.json`: a case that is a template rendered with params rather than a literal
 * situation. This is what makes NFR-4's "a golden test for every template × profile"
 * affordable — twelve cases are twelve four-line files plus the outcome each one is about —
 * and it means a template change fails its cases instead of leaving stale situations behind.
 */
type CaseTemplate = {
  /** A template `id`, as `content/templates/*.yaml` declares it. */
  template: string;
  /** Omitted or `{}` renders with the defaults, which is what most of these cases assert. */
  params?: Record<string, unknown>;
};

/** Loaded once: twelve cases would otherwise re-read and re-parse the tree twelve times. */
let contentCache: ReturnType<typeof loadContent> | undefined;

function loadContent() {
  return {
    fixtures: buildFixtureIndex(loadFixtures(CONTENT_DIR)),
    templates: new Map(loadTemplates(CONTENT_DIR).map((t) => [t.id, t])),
    profiles: new Map(loadProfiles(CONTENT_DIR).map((p) => [p.slug, p])),
  };
}

function content() {
  contentCache ??= loadContent();
  return contentCache;
}

/**
 * A profile slug becomes the pack directories `loadPacks` wants. The naming convention is
 * the tree's own: a pack directory is `<id>-<version>` with the trailing `.0` dropped, which
 * is how `content/` is laid out and how `profiles.yaml` refers to the same packs.
 */
function packDirsFor(profileSlug: string): string[] {
  const profile = content().profiles.get(profileSlug);
  if (profile === undefined) {
    throw new Error(
      `case names profile '${profileSlug}', which content/profiles.yaml does not declare`,
    );
  }
  return profile.layers.map((layer) => {
    const short = layer.version.replace(/\.0$/, '');
    return join(CONTENT_DIR, `${layer.id}-${short}`);
  });
}

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

/**
 * The situation a case runs on: read from `situation.json`, or rendered from `template.json`.
 *
 * A rendered case also writes its situation back out as `situation.snap.txt`, so the case
 * stays replayable from the command line with `pnpm engine run` exactly as a literal one is.
 * It is a snapshot of an *input*, not an input — `template.json` is the source — which is
 * why it carries the same `.snap.txt` suffix as the trace and narrative snapshots beside it:
 * it is regenerated on every run, and editing it achieves nothing.
 */
function situationFor(dir: string, manifest: CaseManifest): Situation {
  const templatePath = join(dir, 'template.json');
  if (!existsSync(templatePath)) {
    // Parsed here as well as inside `evaluate`, so a malformed situation fails as the case
    // that owns it rather than somewhere in the middle of a run.
    return Situation.parse(readJson(join(dir, 'situation.json')));
  }

  const spec = readJson(templatePath) as CaseTemplate;
  if (typeof manifest.profile !== 'string') {
    throw new Error("a template case's `profile` is a profile slug, not a list of directories");
  }

  const template = content().templates.get(spec.template);
  if (template === undefined) {
    throw new Error(`no template '${spec.template}' in content/templates`);
  }

  const situation = renderTemplate(
    template,
    spec.params ?? {},
    content().fixtures,
    manifest.profile,
  );
  writeFileSync(join(dir, 'situation.snap.txt'), `${JSON.stringify(situation, null, 2)}\n`);
  return situation;
}

export function loadCase(name: string): GoldenCase {
  const dir = join(CASES_DIR, name);
  const manifest = readJson(join(dir, 'case.json')) as CaseManifest;
  const forced = readOptionalJson(join(dir, 'forced.json'));

  return {
    name,
    dir,
    manifest,
    situation: situationFor(dir, manifest),
    forcedRolls: (forced ?? {}) as Record<RollId, number[]>,
    expected: readJson(join(dir, 'expected.json')) as Partial<Outcome>,
  };
}

/** Every directory under `cases/` holding a `case.json`, in name order. */
export function discoverCases(): GoldenCase[] {
  return readdirSync(CASES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => existsSync(join(CASES_DIR, name, 'case.json')))
    .sort()
    .map(loadCase);
}

export function runCase(golden: GoldenCase): EvaluationResult {
  const dirs =
    typeof golden.manifest.profile === 'string'
      ? packDirsFor(golden.manifest.profile)
      : golden.manifest.profile.map((dir) => resolve(golden.dir, dir));
  const { packs, facts } = loadPacks(dirs);

  return evaluate(golden.situation, resolveProfile(packs), {
    seed: golden.manifest.seed,
    facts,
    forcedRolls: golden.forcedRolls,
  });
}
