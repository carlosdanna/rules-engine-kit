/**
 * `pnpm content:lint [dir...]` — FR-17 and NFR-6 as a command you can run.
 *
 * Defaults to `content/`, which does not exist yet: authoring the SRD packs is the other
 * half of M2. An absent or empty tree is reported as such and exits 0, so the command is
 * useful before there is anything to check and the pre-commit hook is not a wall.
 *
 * Exit 1 on any error, 0 on warnings alone. A warning is something nobody chose — two
 * rules sharing a phase and a priority order deterministically, by key, but that order is
 * a fallback rather than a decision (ADR-0009) — and stopping a commit for one would only
 * teach people to pass `--no-verify`.
 */

import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { ContentIssue } from '@rules-engine-kit/engine';
import { lintContentTree } from '../lint';

const DEFAULT_ROOT = 'content';

const USAGE = `pnpm content:lint [dir...]

  dir   a content tree, or a single rule pack directory.
        Defaults to '${DEFAULT_ROOT}'.

Checks every pack, fixture and template in the tree: schema, licence and attribution
(NFR-6), citations, unknown fact paths and unsupported operators in conditions, duplicate
rule keys, and overrides, patches or disables of keys no layer below them defines (FR-17).`;

/** `file:path  code  message`, grouped under the file so one file reads as one block. */
function render(issues: readonly ContentIssue[]): string {
  const lines: string[] = [];
  let current = '';

  for (const issue of issues) {
    if (issue.file !== current) {
      if (current !== '') lines.push('');
      lines.push(issue.file);
      current = issue.file;
    }
    const where = issue.path === '' ? '' : ` ${issue.path}`;
    lines.push(`  ${issue.severity}${where} [${issue.code}] ${issue.message}`);
  }

  return lines.join('\n');
}

function summarise(errors: number, warnings: number): string {
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
  return `${plural(errors, 'error')}, ${plural(warnings, 'warning')}`;
}

export function main(argv: readonly string[]): number {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: { help: { type: 'boolean', short: 'h', default: false } },
  });

  if (values.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }

  const roots = (positionals.length > 0 ? positionals : [DEFAULT_ROOT]).map((dir) => resolve(dir));
  const report = lintContentTree(roots);

  if (report.empty && report.issues.length === 0) {
    const where = positionals.length > 0 ? positionals.join(', ') : `${DEFAULT_ROOT}/`;
    process.stdout.write(`content:lint: nothing to check in ${where}\n`);
    return 0;
  }

  if (report.issues.length > 0) {
    process.stderr.write(`${render(report.issues)}\n\n`);
  }
  process.stderr.write(`${summarise(report.errors, report.warnings)}\n`);

  return report.errors > 0 ? 1 : 0;
}

/** Only when invoked as the program, so importing `main` from a test runs nothing. */
if (process.argv[1]?.endsWith('content-lint.ts')) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (thrown) {
    process.stderr.write(`${thrown instanceof Error ? thrown.message : String(thrown)}\n`);
    process.exitCode = 1;
  }
}
