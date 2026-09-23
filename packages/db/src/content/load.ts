/**
 * The loader the seeder uses (M3).
 *
 * Where `lintContentTree` collects every problem, this throws on the first one: a seed run
 * that half-succeeded would leave a database nobody can reason about, and `db:seed` is
 * supposed to be rebuildable from `content/` (ADR-0004). Run the lint to see everything;
 * run this when the tree is already known to be good.
 *
 * It goes through the same `normalize*` functions as `packages/engine/cli.ts`, so a pack
 * means one thing whether it arrives here or through `pnpm engine run` — which is what
 * ADR-0020 asks of this package, and what `test/content/parity.test.ts` holds it to.
 */

import type {
  ContentDoc,
  Fixture,
  ProfileManifest,
  RulesetVersion,
  Template,
} from '@rules-engine-kit/engine';
import {
  normalizeFixture,
  normalizePack,
  normalizeProfilesFile,
  normalizeTemplate,
} from '@rules-engine-kit/engine';
import { ContentLoadError } from './errors';
import { lintContentTree } from './lint';
import type { LoadedScenario } from './scenario';
import { loadScenarios } from './scenarios';
import { discoverContent } from './tree';

/**
 * Everything `db:seed` writes, from one tree.
 *
 * `profiles` and `scenarios` are here because M3's seeded rows come from them and there is no
 * second place to get them: `discoverContent` has always read `profiles.yaml` for the lint but
 * dropped it on the way out, and `scenarios/` sits beside `content/` rather than inside it
 * (ADR-0026, ADR-0028).
 */
export type LoadedContent = {
  packs: RulesetVersion[];
  fixtures: Fixture[];
  templates: Template[];
  profiles: ProfileManifest[];
  scenarios: LoadedScenario[];
};

function first(docs: readonly ContentDoc[]): string {
  return docs[0]?.file ?? '';
}

export function loadContentTree(root: string, scenariosRoot?: string): LoadedContent {
  const { docs } = discoverContent(root);

  // One lint pass first, so a seed failure names the file and the field rather than
  // surfacing as a Zod error from whichever document happened to be parsed first.
  const report = lintContentTree([root]);
  const blocking = report.issues.filter((issue) => issue.severity === 'error');
  if (blocking.length > 0) {
    const shown = blocking
      .slice(0, 5)
      .map(
        (issue) =>
          `  ${issue.file}${issue.path === '' ? '' : `: ${issue.path}`} — ${issue.message}`,
      )
      .join('\n');
    const more = blocking.length > 5 ? `\n  …and ${blocking.length - 5} more` : '';
    throw new ContentLoadError(`${root} has ${blocking.length} content error(s):\n${shown}${more}`);
  }

  const fixtures = docs.fixtures.map((fixture) => normalizeFixture(fixture.doc, fixture.file));
  const templates = docs.templates.map((template) =>
    normalizeTemplate(template.doc, template.file),
  );

  return {
    packs: docs.packs.map((pack) =>
      normalizePack({
        pack: pack.manifest.doc,
        facts: pack.facts.doc,
        rules: pack.rules.map((rule) => rule.doc),
      }),
    ),
    fixtures,
    templates,
    profiles:
      docs.profiles === undefined
        ? []
        : normalizeProfilesFile(docs.profiles.doc, docs.profiles.file),
    // `scenarios/` is the repository's, not the content tree's: a scenario is a *use* of the
    // content rather than part of it, which is why `content:lint` never sees one and why a
    // tree handed to this loader as a single pack directory has none.
    scenarios:
      scenariosRoot === undefined ? [] : loadScenarios(scenariosRoot, { templates, fixtures }),
  };
}

/** The one pack at `dir`, for a caller that wants a profile rather than a whole tree. */
export function loadContentPack(dir: string): RulesetVersion {
  const { packs } = loadContentTree(dir);
  const pack = packs[0];
  if (pack === undefined) {
    throw new ContentLoadError(`${dir} is not a rule pack: no pack.yaml${first([])}`);
  }
  return pack;
}
