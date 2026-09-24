/**
 * `LoadedContent` → the rows `db:seed` writes. Pure: it touches no database and no disk, so
 * every mapping decision in M3 is testable without one.
 *
 * The one thing that is computed rather than copied is `profiles.resolved_hash`, which comes
 * from `resolveProfile` over the profile's ordered stack (ADR-0009). Seeding it means the app
 * can show a profile's hash without re-resolving four stacks on every page, and means a
 * mismatch between what was seeded and what the engine now produces is visible as a failing
 * test rather than as a stale number in the UI.
 */

import type {
  Fixture,
  ProfileManifest,
  RuleEntry,
  RulesetVersion,
  Template,
} from '@rules-engine-kit/engine';
import { resolveProfile } from '@rules-engine-kit/engine';
import type { LoadedContent, LoadedScenario } from '../content';
import { ContentLoadError } from '../content';
import type { fixtures as fixturesTable, templates as templatesTable } from '../schema/content';
import type {
  profileLayers as profileLayersTable,
  profiles as profilesTable,
} from '../schema/profiles';
import type {
  rulesets as rulesetsTable,
  rulesetVersions as rulesetVersionsTable,
  rules as rulesTable,
} from '../schema/rulesets';
import type { scenarios as scenariosTable } from '../schema/scenarios';
import type { sources as sourcesTable } from '../schema/sources';
import { contentHashOf } from './contentHash';
import { fixtureId, packVersionId, ruleId, versionId } from './ids';

type Insert<T extends { $inferInsert: unknown }> = T['$inferInsert'];

export type SeedRows = {
  sources: Insert<typeof sourcesTable>[];
  rulesets: Insert<typeof rulesetsTable>[];
  rulesetVersions: Insert<typeof rulesetVersionsTable>[];
  rules: Insert<typeof rulesTable>[];
  fixtures: Insert<typeof fixturesTable>[];
  templates: Insert<typeof templatesTable>[];
  profiles: Insert<typeof profilesTable>[];
  profileLayers: Insert<typeof profileLayersTable>[];
  scenarios: Insert<typeof scenariosTable>[];
};

/** By id, so two versions of one ruleset give two rows and nothing is written twice. */
function sourceRows(packs: readonly RulesetVersion[]): SeedRows['sources'] {
  const byId = new Map<string, SeedRows['sources'][number]>();

  for (const pack of packs) {
    byId.set(packVersionId(pack), {
      id: packVersionId(pack),
      name: pack.name,
      author: pack.author,
      url: pack.sourceUrl,
      license: pack.license,
      attributionText: pack.attribution,
    });
  }

  return [...byId.values()];
}

/** One row per slug; everything that differs between editions lives on the version. */
function rulesetRows(packs: readonly RulesetVersion[]): SeedRows['rulesets'] {
  const byId = new Map<string, SeedRows['rulesets'][number]>();

  for (const pack of packs) {
    byId.set(pack.id, { id: pack.id, name: pack.name, kind: pack.kind });
  }

  return [...byId.values()];
}

function rulesetVersionRows(packs: readonly RulesetVersion[]): SeedRows['rulesetVersions'] {
  return packs.map((pack) => ({
    id: packVersionId(pack),
    rulesetId: pack.id,
    semver: pack.version,
    baseRulesetId: pack.extends?.id ?? null,
    baseRange: pack.extends?.range ?? null,
    contentHash: contentHashOf(pack),
    facts: pack.facts,
    sourceId: packVersionId(pack),
  }));
}

/**
 * One row per authored entry. An `add` or an `override` fills the body columns; a `patch` is
 * stored as authored, because which fields it *declared* is the patch (ADR-0009); a `disable`
 * carries only its reason. Nothing is stored in two places, so reading these rows back gives
 * the `RuleEntry` that was authored and the profile hash does not move.
 */
export function ruleRow(entry: RuleEntry, rulesetVersionId: string): SeedRows['rules'][number] {
  const base = {
    id: ruleId(rulesetVersionId, entry.key),
    rulesetVersionId,
    ruleKey: entry.key,
    op: entry.op,
  };

  if (entry.op === 'patch') return { ...base, patch: entry };
  if (entry.op === 'disable') return { ...base, reason: entry.reason };

  return {
    ...base,
    phase: entry.phase,
    priority: entry.priority,
    label: entry.label,
    description: entry.description,
    tags: entry.tags,
    condition: entry.condition,
    effects: entry.effects,
    citation: entry.citation,
    interpretation: entry.interpretation,
  };
}

/**
 * A fixture's source, via the profile its citation names.
 *
 * `citation.source` is a *profile* slug (ADR-0026) — `srd-5.1`, not `dnd5e-srd@5.1.0` — so the
 * attributable source is the profile's base layer, position 0. That is the pack whose SRD the
 * stat block was read out of; a house-rule layer on top of it published no stat blocks.
 */
function sourceOfProfile(slug: string, profiles: readonly ProfileManifest[]): string {
  const profile = profiles.find((candidate) => candidate.slug === slug);
  const base = profile?.layers[0];
  if (base === undefined) {
    throw new ContentLoadError(
      `'${slug}' is cited as a source but names no profile in content/profiles.yaml (ADR-0026)`,
    );
  }
  return versionId(base.id, base.version);
}

function fixtureRows(
  fixtures: readonly Fixture[],
  profiles: readonly ProfileManifest[],
): SeedRows['fixtures'] {
  return fixtures.map((fixture) => ({
    id: fixtureId(fixture),
    slug: fixture.slug,
    kind: fixture.kind,
    rulesetScope: fixture.rulesetScope,
    data: fixture.data,
    citation: fixture.citation,
    interpretation: fixture.interpretation,
    sourceId: sourceOfProfile(fixture.citation.source, profiles),
  }));
}

function templateRows(templates: readonly Template[]): SeedRows['templates'] {
  return templates.map((template) => ({
    id: template.id,
    name: template.name,
    description: template.description,
    tags: template.tags,
    paramsSchema: template.params,
    skeleton: template.skeleton,
    suggestedProfiles: template.suggestedProfiles,
    schemaVersion: template.schemaVersion,
  }));
}

/**
 * The profiles, resolved. A layer a profile names but the tree does not hold is an error here
 * as well as in the lint: the lint is what an author runs, and this is what stops a database
 * being written with a hash computed over a stack that was missing a layer.
 */
function profileRows(
  profiles: readonly ProfileManifest[],
  packs: readonly RulesetVersion[],
): Pick<SeedRows, 'profiles' | 'profileLayers'> {
  const byId = new Map(packs.map((pack) => [packVersionId(pack), pack]));
  const rows: SeedRows['profiles'] = [];
  const layers: SeedRows['profileLayers'] = [];

  for (const profile of profiles) {
    const stack = profile.layers.map((layer) => {
      const id = versionId(layer.id, layer.version);
      const pack = byId.get(id);
      if (pack === undefined) {
        throw new ContentLoadError(
          `profile '${profile.slug}' names layer '${id}', which content/ does not hold (ADR-0026)`,
        );
      }
      return { id, pack };
    });

    rows.push({
      id: profile.slug,
      name: profile.name,
      resolvedHash: resolveProfile(stack.map((layer) => layer.pack)).hash,
      origin: 'seed',
    });

    for (const [position, layer] of stack.entries()) {
      layers.push({ profileId: profile.slug, rulesetVersionId: layer.id, position });
    }
  }

  return { profiles: rows, profileLayers: layers };
}

function scenarioRows(scenarios: readonly LoadedScenario[]): SeedRows['scenarios'] {
  return scenarios.map((scenario) => ({
    id: scenario.slug,
    name: scenario.name,
    situation: scenario.situation,
    templateId: scenario.templateId,
    params: scenario.params,
    origin: 'seed',
    schemaVersion: scenario.situation.schemaVersion,
  }));
}

export function rowsFromContent(content: LoadedContent): SeedRows {
  const { profiles, profileLayers } = profileRows(content.profiles, content.packs);

  return {
    sources: sourceRows(content.packs),
    rulesets: rulesetRows(content.packs),
    rulesetVersions: rulesetVersionRows(content.packs),
    rules: content.packs.flatMap((pack) =>
      pack.rules.map((entry) => ruleRow(entry, packVersionId(pack))),
    ),
    fixtures: fixtureRows(content.fixtures, content.profiles),
    templates: templateRows(content.templates),
    profiles,
    profileLayers,
    scenarios: scenarioRows(content.scenarios),
  };
}
