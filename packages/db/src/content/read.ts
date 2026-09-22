/**
 * Bytes off a disk, turned into documents the engine's pure lint can read.
 *
 * A YAML syntax error is a diagnostic here, never a throw: `content:lint` exists to report
 * every problem in a tree in one run, and a tree with two malformed files should take one
 * run to fix, not two.
 */

import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import type { ContentDoc, ContentIssue } from '@rules-engine-kit/engine';
import { parse as parseYaml } from 'yaml';

/** What a report prints: a path from the repo root, not from wherever the shell happened to be. */
export function displayPath(file: string): string {
  const fromHere = relative(process.cwd(), file);
  return fromHere === '' || fromHere.startsWith('..') ? file : fromHere;
}

export type ReadResult = { doc: ContentDoc; issues: ContentIssue[] };

/**
 * `doc` is `undefined` when the file could not be read or parsed, and the issue says why.
 * Returning a document either way keeps `ContentDocs` the same shape in both cases, so the
 * lint has one code path rather than an optional-file branch per document.
 */
export function readYamlDoc(file: string): ReadResult {
  const shown = displayPath(file);
  try {
    return { doc: { file: shown, doc: parseYaml(readFileSync(file, 'utf8')) }, issues: [] };
  } catch (thrown) {
    const missing = (thrown as NodeJS.ErrnoException).code === 'ENOENT';
    return {
      doc: { file: shown, doc: undefined },
      issues: [
        {
          severity: 'error',
          code: 'yaml-parse',
          file: shown,
          path: '',
          message: missing
            ? 'no such file: a rule pack is pack.yaml, facts.yaml and rules/*.yaml (docs/content-authoring.md)'
            : `cannot read as YAML: ${(thrown as Error).message}`,
        },
      ],
    };
  }
}
