/**
 * `pnpm engine run` — evaluate a situation against YAML rule packs and print what happened.
 *
 * This file is the engine's only concession to the outside world. `src/` may not touch
 * `fs`, a clock or global randomness (ADR-0002), and a test in `test/purity.test.ts` holds
 * it to that; the boundary is `src/`, not the package, so the loader lives here (ADR-0020).
 * `src/` therefore still runs in a browser, because nothing under `src/` imports `cli.ts`.
 * It is published as the `./cli` subpath so `packages/db` can load it in one test and hold
 * its own walker to the same answer; that is a second entry point, not a second `src/`.
 *
 * `loadPacks` is exported rather than kept private because the golden harness in
 * `test/golden/` loads the same packs the same way. Two loaders would be two answers to
 * "what does this YAML mean", and the point of a golden case is that there is one.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import {
  normalizeFixture,
  normalizePack,
  normalizeProfilesFile,
  normalizeTemplate,
} from './src/content';
import { evaluate } from './src/evaluator';
import { resolveProfile } from './src/resolver';
import type {
  FactDefinition,
  Fixture,
  ProfileManifest,
  RollId,
  RulesetVersion,
  Template,
} from './src/schema';
import { Situation } from './src/schema';
import { narrateTrace, narrativeContextFromSituation, type TraceLevel } from './src/trace';

class CliError extends Error {
  readonly code = 'CLI';
}

function readYaml(path: string): unknown {
  try {
    return parseYaml(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new CliError(`cannot read ${path}: ${(error as Error).message}`);
  }
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new CliError(`cannot read ${path}: ${(error as Error).message}`);
  }
}

/**
 * A pack is a directory, per `docs/content-authoring.md`: `pack.yaml`, `facts.yaml` and
 * `rules/*.yaml`, one rule per file. The rule files are sorted by name before they are read,
 * so the resolved rule list — and therefore the profile hash (VR-7) — does not depend on
 * the order a filesystem happens to return directory entries in.
 */
export function loadPack(dir: string): RulesetVersion {
  const root = resolve(dir);
  const rulesDir = join(root, 'rules');

  let ruleFiles: string[];
  try {
    ruleFiles = readdirSync(rulesDir)
      .filter((name) => name.endsWith('.yaml') || name.endsWith('.yml'))
      .sort();
  } catch {
    throw new CliError(`${root} is not a rule pack: no rules/ directory`);
  }

  return normalizePack({
    pack: readYaml(join(root, 'pack.yaml')),
    facts: readYaml(join(root, 'facts.yaml')),
    rules: ruleFiles.map((name) => readYaml(join(rulesDir, name))),
  });
}

/** Sorted by name, for the reason `loadPack` sorts its rule files: one answer per machine. */
function yamlFilesIn(dir: string): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    // An absent `fixtures/` or `templates/` is a tree with none, not a broken one.
    return [];
  }
  return names
    .filter((name) => name.endsWith('.yaml') || name.endsWith('.yml'))
    .sort()
    .map((name) => join(dir, name));
}

/**
 * The content tree's fixtures, templates and profiles, read the way `loadPack` reads a pack.
 *
 * These exist here rather than only in `packages/db/src/content` because the golden harness
 * renders templates and `packages/engine` may not depend on `packages/db` — the dependency
 * runs the other way (ADR-0020). That leaves two thin walkers over one shared normaliser, and
 * `packages/db/test/content/parity.test.ts` holds them to the same answer.
 */
export function loadFixtures(root: string): Fixture[] {
  const dir = join(resolve(root), 'fixtures');
  return yamlFilesIn(dir).map((file) => normalizeFixture(readYaml(file), file));
}

export function loadTemplates(root: string): Template[] {
  const dir = join(resolve(root), 'templates');
  return yamlFilesIn(dir).map((file) => normalizeTemplate(readYaml(file), file));
}

/** `profiles.yaml` sits at the root of the tree, beside the pack directories (ADR-0026). */
export function loadProfiles(root: string): ProfileManifest[] {
  const file = join(resolve(root), 'profiles.yaml');
  if (!existsSync(file)) return [];
  return normalizeProfilesFile(readYaml(file), file);
}

export type LoadedProfile = {
  /** In declared order, base first — what `resolveProfile` expects (ADR-0018). */
  packs: RulesetVersion[];
  /** Every layer's fact definitions, merged into the one flat list `evaluate` takes. */
  facts: FactDefinition[];
};

/**
 * Load an ordered stack of packs.
 *
 * The fact merge is the part worth explaining. `RulesetVersion.facts` is per pack, but
 * `evaluate` takes a single flat `facts` array and builds one registry from it, and
 * `createFactRegistry` throws on a duplicate path — so a layer that redeclares a path its
 * base already declared would fail at evaluation rather than at load. A redeclaration is
 * normal and harmless when the two agree (a layer repeating a path it reads), so the first
 * declaration wins; a genuine disagreement about a path's `type` is a content bug and is
 * reported as one.
 */
export function loadPacks(dirs: readonly string[]): LoadedProfile {
  const packs = dirs.map(loadPack);
  const facts = new Map<string, FactDefinition>();

  for (const pack of packs) {
    for (const fact of pack.facts) {
      const existing = facts.get(fact.path);
      if (existing === undefined) {
        facts.set(fact.path, fact);
      } else if (
        existing.type !== fact.type ||
        existing.derived !== fact.derived ||
        existing.nullable !== fact.nullable
      ) {
        const describe = (declaration: FactDefinition) =>
          `${declaration.type}${declaration.derived ? ' (derived)' : ''}` +
          `${declaration.nullable ? ' (nullable)' : ''}`;
        throw new CliError(
          `fact '${fact.path}' is declared twice with different meanings: ` +
            `${describe(existing)} then ${describe(fact)}`,
        );
      }
    }
  }

  return { packs, facts: [...facts.values()] };
}

const USAGE = `pnpm engine run --packs <dir>[,<dir>...] --situation <file> --seed <s>
                [--forced <file>] [--narrative] [--trace-level full|fired-only]

  --packs        ordered pack directories, base first (ADR-0018)
  --situation    a situation JSON file
  --seed         the RNG seed; the same seed gives the same run (NFR-1)
  --forced       JSON of forced dice, keyed by roll id (ADR-0011), e.g.
                 { "r1-fighter/attack:fighter": [4, 17] }
  --narrative    print the trace as prose instead of JSON (NFR-7)
  --trace-level  'full' (default) records every rule considered; 'fired-only' does not`;

function parseTraceLevel(value: string | undefined): TraceLevel | undefined {
  if (value === undefined) return undefined;
  if (value === 'full' || value === 'fired-only') return value;
  throw new CliError(`--trace-level must be 'full' or 'fired-only', not '${value}'`);
}

function required(value: string | undefined, flag: string): string {
  if (value === undefined) throw new CliError(`${flag} is required\n\n${USAGE}`);
  return value;
}

export function main(argv: readonly string[]): number {
  const [command, ...rest] = argv;

  if (command === undefined || command === '--help' || command === '-h') {
    process.stdout.write(`${USAGE}\n`);
    return command === undefined ? 1 : 0;
  }
  if (command !== 'run') {
    throw new CliError(`unknown command '${command}'\n\n${USAGE}`);
  }

  const { values } = parseArgs({
    args: [...rest],
    options: {
      packs: { type: 'string' },
      situation: { type: 'string' },
      seed: { type: 'string' },
      forced: { type: 'string' },
      narrative: { type: 'boolean', default: false },
      'trace-level': { type: 'string' },
    },
  });

  // Every required flag is checked before any work, so a missing `--situation` is not
  // reported after a second of loading packs.
  const packsFlag = required(values.packs, '--packs');
  const situationPath = required(values.situation, '--situation');
  const seed = required(values.seed, '--seed');
  const traceLevel = parseTraceLevel(values['trace-level']);

  const packDirs = packsFlag
    .split(',')
    .map((dir) => dir.trim())
    .filter((dir) => dir.length > 0);
  const { packs, facts } = loadPacks(packDirs);
  const profile = resolveProfile(packs);

  // Conflicts do not stop resolution — they are content problems the author should see
  // (FR-12) — so they go to stderr and leave stdout parseable.
  for (const conflict of profile.conflicts) {
    process.stderr.write(
      `conflict: ${conflict.kind} on '${conflict.ruleKey}' from ${conflict.layer}: ${conflict.detail}\n`,
    );
  }

  const situation = Situation.parse(readJson(situationPath));
  const forcedRolls =
    values.forced === undefined ? undefined : (readJson(values.forced) as Record<RollId, number[]>);

  const { outcome, trace } = evaluate(situation, profile, {
    seed,
    facts,
    ...(forcedRolls === undefined ? {} : { forcedRolls }),
    ...(traceLevel === undefined ? {} : { traceLevel }),
  });

  process.stdout.write(`${JSON.stringify(outcome, null, 2)}\n`);
  process.stdout.write(
    values.narrative
      ? `\n${narrateTrace(trace, narrativeContextFromSituation(situation))}\n`
      : `${JSON.stringify(trace, null, 2)}\n`,
  );
  return 0;
}

/** A stack trace is noise for a bad flag or a mistyped path; the message is the answer. */
function describe(error: unknown): string {
  if (error instanceof z.ZodError) return z.prettifyError(error);
  return error instanceof Error ? error.message : String(error);
}

/**
 * Only run when invoked as the program, so importing `loadPacks` from the golden harness
 * does not evaluate anything.
 */
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${describe(error)}\n`);
    process.exitCode = 1;
  }
}
