/**
 * `pnpm credits:deps` against a throwaway workspace. Built in a temp directory rather than
 * committed, because a fixture's `node_modules/` would be ignored by git.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  collectRuntimeDependencies,
  END_MARKER,
  renderDependencyTable,
  replaceGenerated,
  repositoryUrl,
  START_MARKER,
} from '../../src/credits/deps';

let root: string;

function write(path: string, json: unknown): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), JSON.stringify(json));
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'credits-deps-'));
  write('apps/web/package.json', {
    name: '@x/web',
    dependencies: { '@x/core': 'workspace:*', zeta: '^1.0.0', alpha: '^2.0.0' },
    devDependencies: { tooling: '^1.0.0' },
  });
  write('packages/core/package.json', { name: '@x/core', dependencies: { alpha: '^2.0.0' } });
  write('apps/web/node_modules/zeta/package.json', {
    name: 'zeta',
    license: 'ISC',
    repository: 'github:someone/zeta',
  });
  write('apps/web/node_modules/alpha/package.json', {
    name: 'alpha',
    license: 'MIT',
    homepage: 'https://alpha.example',
  });
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('collectRuntimeDependencies', () => {
  it('takes dependencies only, skips the workspace, dedupes and sorts', () => {
    expect(collectRuntimeDependencies(root)).toEqual([
      { name: 'alpha', license: 'MIT', url: 'https://alpha.example' },
      { name: 'zeta', license: 'ISC', url: 'https://github.com/someone/zeta' },
    ]);
  });

  it('refuses a dependency that states no licence', () => {
    write('apps/web/node_modules/zeta/package.json', { name: 'zeta' });
    expect(() => collectRuntimeDependencies(root)).toThrow(/zeta .* no licence/);
  });

  it('refuses a dependency that is not installed', () => {
    rmSync(join(root, 'apps/web/node_modules/zeta'), { recursive: true });
    expect(() => collectRuntimeDependencies(root)).toThrow(
      /zeta is declared by apps\/web but not installed/,
    );
  });
});

describe('repositoryUrl', () => {
  it.each([
    ['vercel/next.js', 'https://github.com/vercel/next.js'],
    ['github:eemeli/yaml', 'https://github.com/eemeli/yaml'],
    [{ url: 'git+https://github.com/colinhacks/zod.git' }, 'https://github.com/colinhacks/zod'],
    [
      { url: 'git://github.com/WiseLibs/better-sqlite3.git' },
      'https://github.com/WiseLibs/better-sqlite3',
    ],
  ])('%j becomes %s', (repository, expected) => {
    expect(repositoryUrl(repository)).toBe(expected);
  });
});

describe('replaceGenerated', () => {
  const table = renderDependencyTable([{ name: 'a', license: 'MIT', url: 'https://a' }]);

  it('rewrites only what lies between the markers, and is idempotent', () => {
    const before = `# Credits\n\n${START_MARKER}\nstale\n${END_MARKER}\n\nTooling stays.\n`;
    const once = replaceGenerated(before, table);
    expect(once).toBe(
      `# Credits\n\n${START_MARKER}\nRuntime:\n\n| Package | Licence |\n| --- | --- |\n| [a](https://a) | MIT |\n${END_MARKER}\n\nTooling stays.\n`,
    );
    expect(replaceGenerated(once, table)).toBe(once);
  });

  it('refuses a document without the markers', () => {
    expect(() => replaceGenerated('# Credits\n', table)).toThrow(/needs/);
  });
});
