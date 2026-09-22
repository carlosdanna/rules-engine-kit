/**
 * `pnpm content:lint` end to end, over two trees on disk.
 *
 * `content-broken/` holds every `ContentIssueCode` exactly once, so the assertion that
 * matters is the whole set at once: one run has to report all of them. A lint that stops
 * at the first mistake is a lint people run once and then work around.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { lintContentTree } from '../../src/content';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const OK = join(FIXTURES, 'content-ok');
const BROKEN = join(FIXTURES, 'content-broken');

const GOLDEN_PACK = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'engine',
  'test',
  'golden',
  'packs',
  'srd-5.2.1-min',
);

describe('a tree with nothing wrong with it', () => {
  it('reports nothing', () => {
    expect(lintContentTree([OK])).toMatchObject({ issues: [], errors: 0, warnings: 0 });
  });

  it('passes the pack the golden cases actually run on', () => {
    expect(lintContentTree([GOLDEN_PACK]).errors).toBe(0);
  });

  it('says a tree is empty rather than calling an absent one clean', () => {
    expect(lintContentTree([join(FIXTURES, 'no-such-tree')]).empty).toBe(true);
    expect(lintContentTree([OK]).empty).toBe(false);
  });
});

describe('a tree with one of everything wrong with it', () => {
  const report = lintContentTree([BROKEN]);

  it('reports every issue code in one pass', () => {
    expect(new Set(report.issues.map((issue) => issue.code))).toEqual(
      new Set([
        'yaml-parse',
        'schema',
        'missing-license',
        'missing-attribution',
        'missing-citation',
        'unknown-fact',
        'unsupported-operator',
        'duplicate-fact',
        'duplicate-rule-key',
        'override-missing',
        'patch-missing',
        'patch-forbidden-field',
        'disable-missing',
        'priority-tie',
        'unresolvable-base',
      ]),
    );
  });

  it('reports each of them exactly once', () => {
    const counts = new Map<string, number>();
    for (const issue of report.issues) {
      counts.set(issue.code, (counts.get(issue.code) ?? 0) + 1);
    }
    expect([...counts].filter(([, count]) => count !== 1)).toEqual([]);
  });

  it('gives every issue a file in the tree it was asked about', () => {
    for (const issue of report.issues) {
      expect(issue.file).toMatch(/fixtures\/content-broken\//);
    }
  });

  it('counts errors and warnings separately, because only errors fail a commit', () => {
    expect(report.warnings).toBe(1);
    expect(report.errors).toBe(report.issues.length - 1);
  });

  it('treats a priority tie as a warning: deterministic, but nobody chose it (ADR-0009)', () => {
    const ties = report.issues.filter((issue) => issue.code === 'priority-tie');
    expect(ties.map((issue) => issue.severity)).toEqual(['warning']);
  });

  it('sorts errors before warnings, so a report reads in the order it is worked through', () => {
    const severities = report.issues.map((issue) => issue.severity);
    expect(severities.indexOf('warning')).toBe(severities.length - 1);
  });

  it('does not let a missing licence hide the rest of the pack below it', () => {
    const inBase = report.issues.filter((issue) => issue.file.includes('base-5.0.0/rules/'));
    expect(inBase.length).toBeGreaterThan(5);
  });

  it('does not lint a file it could not parse', () => {
    const unreadable = report.issues.filter((issue) => issue.file.includes('not-yaml.yaml'));
    expect(unreadable.map((issue) => issue.code)).toEqual(['yaml-parse']);
  });
});

describe('several roots', () => {
  it('does not match one tree`s layers against another tree`s bases', () => {
    const together = lintContentTree([OK, BROKEN]);
    const apart = lintContentTree([OK]).issues.length + lintContentTree([BROKEN]).issues.length;
    expect(together.issues).toHaveLength(apart);
  });
});
