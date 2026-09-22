/**
 * The two loaders must mean the same thing.
 *
 * ADR-0020 keeps `loadPack` in `packages/engine/cli.ts` so the golden harness can use it
 * without `packages/engine` depending on `packages/db` — the dependency direction is
 * `db → engine` and the engine's own tests could not reach back across it. The cost of
 * that decision is two thin walkers over one shared core: `cli.ts` supplies bytes for
 * `pnpm engine run` and the golden cases, `src/content` supplies them for `content:lint`
 * and, in M3, for the seeds.
 *
 * Both call the same `normalizePack`, so they cannot disagree about what a shorthand
 * means. What they *could* drift on is everything around it — which files make up a pack,
 * what order the rule files are read in (VR-7), which extensions count. This test is what
 * stops that, by loading the pack the golden cases actually run on through both and
 * demanding the same object back.
 *
 * ADR-0026 widened the surface: the golden harness now renders templates, so `cli.ts` also
 * walks `fixtures/`, `templates/` and `profiles.yaml`. Those walkers are held to the same
 * answer here for the same reason — a case that passes in the suite must mean the same thing
 * as the tree `content:lint` and the seeds read.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFixtures, loadPack, loadProfiles, loadTemplates } from '@rules-engine-kit/engine/cli';
import { describe, expect, it } from 'vitest';
import { loadContentTree } from '../../src/content';

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

describe('the CLI loader and the content loader (ADR-0020)', () => {
  it('produce the same RulesetVersion from the same pack directory', () => {
    const [viaContent] = loadContentTree(GOLDEN_PACK).packs;
    expect(viaContent).toEqual(loadPack(GOLDEN_PACK));
  });

  it('agree on the order of the rules, which the profile hash depends on (VR-7)', () => {
    const [viaContent] = loadContentTree(GOLDEN_PACK).packs;
    expect(viaContent?.rules.map((rule) => rule.key)).toEqual(
      loadPack(GOLDEN_PACK).rules.map((rule) => rule.key),
    );
  });
});

describe('the CLI loader and the content loader — fixtures, templates and profiles (ADR-0026)', () => {
  const OK = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'content-ok');

  it('produce the same fixtures, in the same order', () => {
    expect(loadFixtures(OK)).toEqual(loadContentTree(OK).fixtures);
  });

  it('produce the same templates', () => {
    expect(loadTemplates(OK)).toEqual(loadContentTree(OK).templates);
  });

  it('read the same profiles.yaml', () => {
    expect(loadProfiles(OK).map((profile) => profile.slug)).toEqual([
      'srd-5.2.1',
      'srd-5.2.1+flanking',
    ]);
  });

  it('read an absent fixtures/, templates/ or profiles.yaml as none, not as an error', () => {
    // `content:lint <one-pack>` is handed a pack directory, which has none of the three.
    const pack = join(OK, 'dnd5e-srd-5.2.1');
    expect(loadFixtures(pack)).toEqual([]);
    expect(loadTemplates(pack)).toEqual([]);
    expect(loadProfiles(pack)).toEqual([]);
  });
});

describe('loadContentTree', () => {
  const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

  it('loads a whole tree: packs, fixtures and templates', () => {
    const loaded = loadContentTree(join(FIXTURES, 'content-ok'));
    expect(loaded.packs.map((pack) => pack.id)).toEqual(['dnd5e-srd', 'house-flanking']);
    expect(loaded.fixtures.map((fixture) => fixture.slug)).toEqual(['goblin', 'longsword']);
    expect(loaded.templates.map((template) => template.id)).toEqual(['melee-attack']);
  });

  it('normalises an authored fixture on the way through', () => {
    const loaded = loadContentTree(join(FIXTURES, 'content-ok'));
    const longsword = loaded.fixtures.find((fixture) => fixture.slug === 'longsword');
    expect(longsword?.kind === 'item' && longsword.data.damage).toEqual({
      dice: { count: 1, sides: 8 },
      type: 'slashing',
    });
  });

  it('refuses a tree the lint would fail, naming the files (ADR-0004)', () => {
    expect(() => loadContentTree(join(FIXTURES, 'content-broken'))).toThrow(/content error/);
  });
});
