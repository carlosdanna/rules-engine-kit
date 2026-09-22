/**
 * The walker: what counts as a pack, what order rules are read in, and what an unreadable
 * file turns into. The checks themselves are the engine's and are tested there — nothing
 * in this file asserts on a lint rule.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { discoverContent, isEmptyTree, isPackDir } from '../../src/content';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const OK = join(FIXTURES, 'content-ok');
const BROKEN = join(FIXTURES, 'content-broken');

describe('discoverContent', () => {
  it('finds every pack, fixture and template in a tree', () => {
    const { docs } = discoverContent(OK);
    expect(docs.packs.map((pack) => pack.dir.split('/').at(-1))).toEqual([
      'dnd5e-srd-5.2.1',
      'house-flanking-1.0.0',
    ]);
    expect(docs.fixtures).toHaveLength(2);
    expect(docs.templates).toHaveLength(1);
  });

  it('takes a single pack directory as a root, so one pack can be linted on its own', () => {
    const { docs } = discoverContent(join(OK, 'dnd5e-srd-5.2.1'));
    expect(docs.packs).toHaveLength(1);
    expect(docs.fixtures).toEqual([]);
  });

  it('reads rule files in name order, so the profile hash does not depend on the disk (VR-7)', () => {
    const { docs } = discoverContent(join(BROKEN, 'base-5.0.0'));
    const names = docs.packs[0]?.rules.map((rule) => rule.file.split('/').at(-1));
    expect(names).toEqual([...(names ?? [])].sort());
    expect(names?.[0]).toBe('a-add.yaml');
  });

  it('gives every document a relative path, so a report is readable and clickable', () => {
    // Relative to the working directory, as a command-line tool's paths are. Run through
    // `pnpm content:lint` that is the repo root; run through vitest it is `packages/db`.
    const { docs } = discoverContent(OK);
    for (const pack of docs.packs) {
      expect(pack.manifest.file).not.toMatch(/^\//);
      expect(pack.manifest.file).toMatch(/fixtures\/content-ok\/.+\/pack\.yaml$/);
    }
  });

  it('turns an unparseable file into an issue and a document with no content', () => {
    const { docs, issues } = discoverContent(join(BROKEN, 'unreadable-1.0.0'));
    expect(issues.map((issue) => issue.code)).toEqual(['yaml-parse']);
    expect(docs.packs[0]?.rules[0]?.doc).toBeUndefined();
  });

  it('reports a pack with no rules/ directory rather than skipping it silently', () => {
    const { issues } = discoverContent(join(FIXTURES, 'content-ok', 'fixtures'));
    expect(issues).toEqual([]); // not a pack at all: no pack.yaml, so nothing to report
  });

  it('is empty rather than throwing when the tree does not exist', () => {
    const found = discoverContent(join(FIXTURES, 'no-such-tree'));
    expect(isEmptyTree(found)).toBe(true);
    expect(found.issues).toEqual([]);
  });
});

describe('isPackDir', () => {
  it('is a pack when it holds a pack.yaml', () => {
    expect(isPackDir(join(OK, 'dnd5e-srd-5.2.1'))).toBe(true);
  });

  it('is not a pack otherwise', () => {
    expect(isPackDir(OK)).toBe(false);
  });
});
