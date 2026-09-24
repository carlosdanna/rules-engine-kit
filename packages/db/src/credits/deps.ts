/**
 * The Runtime table of CREDITS.md's Software section, generated from what the workspace
 * actually depends on (CLAUDE.md: keep CREDITS.md accurate when adding any dependency).
 *
 * "Runtime" is every workspace package's `dependencies` — not `devDependencies`, which are
 * tooling and stay a hand-kept table — minus the workspace's own packages. Licence and link
 * come from each dependency's *installed* manifest, so the table states what is on disk rather
 * than what someone remembered. A dependency with no licence is an error, not a blank cell: a
 * public repository cannot credit what it cannot name the terms of.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

type Repository = string | { url?: string };

export type Manifest = {
  name?: string;
  dependencies?: Record<string, string>;
  license?: string;
  licenses?: ReadonlyArray<{ type?: string }>;
  homepage?: string;
  repository?: Repository;
};

export type RuntimeDependency = {
  name: string;
  license: string;
  url: string;
};

export const START_MARKER = '<!-- credits:deps:start -->';
export const END_MARKER = '<!-- credits:deps:end -->';

/** The directories `pnpm-workspace.yaml` globs (`apps/*`, `packages/*`) that hold a package. */
export function workspaceDirs(root: string): string[] {
  return ['apps', 'packages']
    .flatMap((group) => {
      const dir = join(root, group);
      if (!existsSync(dir)) return [];
      return readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(dir, entry.name));
    })
    .filter((dir) => existsSync(join(dir, 'package.json')))
    .sort();
}

function readManifest(path: string): Manifest {
  return JSON.parse(readFileSync(path, 'utf8')) as Manifest;
}

/** `git+https://…/x.git`, `git://…`, `github:owner/repo` and bare `owner/repo` all become a URL. */
export function repositoryUrl(repository: Repository | undefined): string | undefined {
  const raw = typeof repository === 'string' ? repository : repository?.url;
  if (raw === undefined || raw === '') return undefined;

  const shorthand = /^(?:github:)?([\w.-]+\/[\w.-]+)$/.exec(raw);
  if (shorthand !== null) return `https://github.com/${shorthand[1]}`;

  return raw
    .replace(/^git\+/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/^ssh:\/\/git@/, 'https://')
    .replace(/\.git$/, '');
}

function licenseOf(manifest: Manifest): string | undefined {
  if (typeof manifest.license === 'string' && manifest.license !== '') return manifest.license;
  const legacy = manifest.licenses?.map((entry) => entry.type).filter((type) => type !== undefined);
  return legacy !== undefined && legacy.length > 0 ? legacy.join(' OR ') : undefined;
}

/**
 * Every runtime dependency of every workspace package, deduplicated by name and sorted.
 * Each dependency is read from the `node_modules` of the first package that declares it,
 * which is where pnpm links it.
 */
export function collectRuntimeDependencies(root: string): RuntimeDependency[] {
  const dirs = workspaceDirs(root);
  const workspaceNames = new Set(dirs.map((dir) => readManifest(join(dir, 'package.json')).name));
  const found = new Map<string, RuntimeDependency>();

  for (const dir of dirs) {
    const declared = readManifest(join(dir, 'package.json')).dependencies ?? {};
    for (const [name, range] of Object.entries(declared)) {
      if (range.startsWith('workspace:') || workspaceNames.has(name)) continue;

      if (found.has(name)) continue;
      const usedBy = relative(root, dir);

      const installed = join(dir, 'node_modules', name, 'package.json');
      if (!existsSync(installed)) {
        throw new Error(`${name} is declared by ${usedBy} but not installed; run pnpm i`);
      }
      const manifest = readManifest(installed);
      const license = licenseOf(manifest);
      if (license === undefined) {
        throw new Error(`${name} (declared by ${usedBy}) states no licence in its package.json`);
      }
      found.set(name, {
        name,
        license,
        url:
          manifest.homepage ??
          repositoryUrl(manifest.repository) ??
          `https://www.npmjs.com/package/${name}`,
      });
    }
  }

  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The `Runtime:` group in the two-column shape `apps/web/lib/credits.ts` parses for `/credits`
 * — a labelled pipe table of `| [name](url) | licence |` rows.
 */
export function renderDependencyTable(dependencies: readonly RuntimeDependency[]): string {
  const rows = dependencies.map((dep) => `| [${dep.name}](${dep.url}) | ${dep.license} |`);
  return ['Runtime:', '', '| Package | Licence |', '| --- | --- |', ...rows].join('\n');
}

/** The document with the text between the two markers replaced; throws if either is missing. */
export function replaceGenerated(document: string, generated: string): string {
  const start = document.indexOf(START_MARKER);
  const end = document.indexOf(END_MARKER);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`CREDITS.md needs ${START_MARKER} followed by ${END_MARKER}`);
  }
  return `${document.slice(0, start + START_MARKER.length)}\n${generated}\n${document.slice(end)}`;
}
