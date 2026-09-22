/**
 * `pnpm content:lint` (FR-17, NFR-6), assembled from the two halves.
 *
 * The checks are `lintContent` in `packages/engine/src/content`, which is pure and knows
 * nothing about files; everything here is the part that reads a disk. ADR-0020 puts the
 * boundary at `packages/engine/src`, so this is the side of it that may use `fs` — and
 * `packages/db` is where `architecture.md` has always said the content loader lives.
 */

import type { ContentIssue } from '@rules-engine-kit/engine';
import { lintContent } from '@rules-engine-kit/engine';
import { discoverContent, isEmptyTree } from './tree';

export type ContentLintReport = {
  issues: ContentIssue[];
  errors: number;
  warnings: number;
  /** True when no root held any content. The command says so rather than claiming success. */
  empty: boolean;
};

const SEVERITY_ORDER = { error: 0, warning: 1 } as const;

/**
 * Errors first, then by file and by the path inside it, so a report reads top-down in the
 * order someone would work through it rather than in the order the checks happened to run.
 */
function compareIssues(a: ContentIssue, b: ContentIssue): number {
  const severity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
  if (severity !== 0) return severity;
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  if (a.path !== b.path) return a.path < b.path ? -1 : 1;
  return 0;
}

/**
 * Each root is linted on its own, because a stack only makes sense within one tree: two
 * unrelated roots on one command line should not have their layers matched against each
 * other's bases.
 */
export function lintContentTree(roots: readonly string[]): ContentLintReport {
  const issues: ContentIssue[] = [];
  let empty = true;

  for (const root of roots) {
    const found = discoverContent(root);
    if (!isEmptyTree(found)) empty = false;
    issues.push(...found.issues, ...lintContent(found.docs));
  }

  issues.sort(compareIssues);

  return {
    issues,
    errors: issues.filter((issue) => issue.severity === 'error').length,
    warnings: issues.filter((issue) => issue.severity === 'warning').length,
    empty,
  };
}
