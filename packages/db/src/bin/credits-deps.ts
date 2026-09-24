#!/usr/bin/env tsx
/**
 * `pnpm credits:deps [--check]` — rewrite the generated Runtime table in CREDITS.md.
 *
 * `--check` writes nothing and exits 1 when the file is out of date, which is how `pnpm check`
 * keeps a dependency from landing without its credit.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  collectRuntimeDependencies,
  renderDependencyTable,
  replaceGenerated,
} from '../credits/deps';
import { REPO_ROOT } from '../paths';

function main(argv: readonly string[]): number {
  const unknown = argv.filter((arg) => arg !== '--check');
  if (unknown.length > 0) {
    process.stderr.write(
      `unknown option ${unknown.join(' ')}\nusage: pnpm credits:deps [--check]\n`,
    );
    return 1;
  }

  const path = join(REPO_ROOT, 'CREDITS.md');
  const current = readFileSync(path, 'utf8');
  const dependencies = collectRuntimeDependencies(REPO_ROOT);
  const next = replaceGenerated(current, renderDependencyTable(dependencies));

  if (argv.includes('--check')) {
    if (next === current) return 0;
    process.stderr.write(
      'CREDITS.md is out of date with the runtime dependencies; run pnpm credits:deps\n',
    );
    return 1;
  }

  writeFileSync(path, next);
  process.stdout.write(`CREDITS.md: ${dependencies.length} runtime dependencies\n`);
  return 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exitCode = 1;
}
