/**
 * Walk a content tree and hand the engine its documents.
 *
 * The layout is `docs/content-authoring.md`'s: a pack is a directory holding `pack.yaml`,
 * `facts.yaml` and `rules/*.yaml`, and fixtures and templates sit beside the packs in
 * `fixtures/` and `templates/`. A directory that *is* a pack is accepted as a root too, so
 * `pnpm content:lint <one-pack>` works without inventing a wrapper directory for it.
 *
 * Rule files are sorted by name before they are read, for the same reason `cli.ts` sorts
 * them: the resolved rule list, and therefore the profile hash (VR-7), must not depend on
 * the order a filesystem happens to return directory entries in.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { AuthoredPackDocs, ContentDocs, ContentIssue } from '@rules-engine-kit/engine';
import { displayPath, readYamlDoc } from './read';

export const PACK_MANIFEST = 'pack.yaml';
const FACTS = 'facts.yaml';
const RULES_DIR = 'rules';
const FIXTURES_DIR = 'fixtures';
const TEMPLATES_DIR = 'templates';

const isYaml = (name: string) => name.endsWith('.yaml') || name.endsWith('.yml');

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Sorted, so a report and a profile hash read the same on every machine. */
function yamlFilesIn(dir: string): string[] {
  if (!isDirectory(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isYaml(entry.name))
    .map((entry) => entry.name)
    .sort()
    .map((name) => join(dir, name));
}

export const isPackDir = (dir: string): boolean => existsSync(join(dir, PACK_MANIFEST));

export type DiscoveredContent = {
  docs: ContentDocs;
  /** Unreadable or missing files. The lint itself never sees a filesystem. */
  issues: ContentIssue[];
};

function readPack(dir: string, issues: ContentIssue[]): AuthoredPackDocs {
  const manifest = readYamlDoc(join(dir, PACK_MANIFEST));
  const facts = readYamlDoc(join(dir, FACTS));
  issues.push(...manifest.issues, ...facts.issues);

  const rulesDir = join(dir, RULES_DIR);
  if (!isDirectory(rulesDir)) {
    issues.push({
      severity: 'error',
      code: 'yaml-parse',
      file: displayPath(rulesDir),
      path: '',
      message: 'no rules/ directory: a pack with no rules cannot be resolved into a profile',
    });
  }

  const rules = yamlFilesIn(rulesDir).map((file) => {
    const read = readYamlDoc(file);
    issues.push(...read.issues);
    return read.doc;
  });

  return { dir: displayPath(dir), manifest: manifest.doc, facts: facts.doc, rules };
}

function readLoose(dir: string, issues: ContentIssue[]) {
  return yamlFilesIn(dir).map((file) => {
    const read = readYamlDoc(file);
    issues.push(...read.issues);
    return read.doc;
  });
}

export function discoverContent(root: string): DiscoveredContent {
  const issues: ContentIssue[] = [];

  // A pack directory handed straight to the command is that one pack, with no fixtures or
  // templates around it.
  if (isPackDir(root)) {
    return { docs: { packs: [readPack(root, issues)], fixtures: [], templates: [] }, issues };
  }

  const packDirs = isDirectory(root)
    ? readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(root, entry.name))
        .filter(isPackDir)
        .sort()
    : [];

  return {
    docs: {
      packs: packDirs.map((dir) => readPack(dir, issues)),
      fixtures: readLoose(join(root, FIXTURES_DIR), issues),
      templates: readLoose(join(root, TEMPLATES_DIR), issues),
    },
    issues,
  };
}

/** True when there is nothing to lint: the tree is absent, or holds no content at all. */
export function isEmptyTree(found: DiscoveredContent): boolean {
  const { packs, fixtures, templates } = found.docs;
  return packs.length === 0 && fixtures.length === 0 && templates.length === 0;
}
