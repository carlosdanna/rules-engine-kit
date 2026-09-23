import 'server-only';

/**
 * Every read the browse routes make, in one place.
 *
 * `packages/db` ships the schema and the id builders but no repository layer, so these are
 * hand-written Drizzle queries. They return rows with the engine's types already attached —
 * the JSON columns are declared with `$type<…>()` in `packages/db/src/schema` — so a page
 * maps nothing.
 */

import {
  type FixtureRow,
  fixtures,
  profileLayers,
  profiles,
  type RuleRow,
  type RulesetRow,
  type RulesetVersionRow,
  rules,
  rulesets,
  rulesetVersions,
  type SourceRow,
  sources,
  type TemplateRow,
  templates,
  versionId,
} from '@rules-engine-kit/db';
import { and, asc, count, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';

/** A profile that carries a given ruleset version, and where in its stack it sits. */
export type ProfileUse = { id: string; name: string; position: number };

export type VersionSummary = {
  version: RulesetVersionRow;
  ruleset: RulesetRow;
  source: SourceRow;
  ruleCount: number;
  profiles: ProfileUse[];
};

/**
 * `rulesets.name` is deliberately not read anywhere in this file. The seed builds that row
 * last-pack-wins, so `dnd5e-srd` currently reads "SRD 5.2.1" — the name of whichever edition
 * happened to be seeded last. A version's display name is its `sources.name`, which is
 * per-edition by construction (ADR-0027).
 */
export function displayName(source: SourceRow): string {
  return source.name;
}

export async function listVersions(): Promise<VersionSummary[]> {
  const db = getDb();

  const rows = await db
    .select({ version: rulesetVersions, ruleset: rulesets, source: sources })
    .from(rulesetVersions)
    .innerJoin(rulesets, eq(rulesetVersions.rulesetId, rulesets.id))
    .innerJoin(sources, eq(rulesetVersions.sourceId, sources.id))
    .orderBy(asc(rulesetVersions.rulesetId), asc(rulesetVersions.semver));

  const counts = new Map(
    (
      await db
        .select({ versionId: rules.rulesetVersionId, n: count() })
        .from(rules)
        .groupBy(rules.rulesetVersionId)
    ).map((row) => [row.versionId, row.n]),
  );

  const uses = new Map<string, ProfileUse[]>();
  for (const row of await db
    .select({
      versionId: profileLayers.rulesetVersionId,
      id: profiles.id,
      name: profiles.name,
      position: profileLayers.position,
    })
    .from(profileLayers)
    .innerJoin(profiles, eq(profileLayers.profileId, profiles.id))
    .orderBy(asc(profiles.id))) {
    const list = uses.get(row.versionId) ?? [];
    list.push({ id: row.id, name: row.name, position: row.position });
    uses.set(row.versionId, list);
  }

  return rows.map((row) => ({
    ...row,
    ruleCount: counts.get(row.version.id) ?? 0,
    profiles: uses.get(row.version.id) ?? [],
  }));
}

export type VersionDetail = VersionSummary & { rules: RuleRow[] };

/** `null` when the slug/semver pair names no seeded version, which the page turns into a 404. */
export async function getVersion(slug: string, semver: string): Promise<VersionDetail | null> {
  const db = getDb();
  const id = versionId(slug, semver);

  const row = (
    await db
      .select({ version: rulesetVersions, ruleset: rulesets, source: sources })
      .from(rulesetVersions)
      .innerJoin(rulesets, eq(rulesetVersions.rulesetId, rulesets.id))
      .innerJoin(sources, eq(rulesetVersions.sourceId, sources.id))
      .where(eq(rulesetVersions.id, id))
      .limit(1)
  )[0];
  if (!row) return null;

  const [ruleRows, useRows] = await Promise.all([
    db.select().from(rules).where(eq(rules.rulesetVersionId, id)).orderBy(asc(rules.ruleKey)),
    db
      .select({ id: profiles.id, name: profiles.name, position: profileLayers.position })
      .from(profileLayers)
      .innerJoin(profiles, eq(profileLayers.profileId, profiles.id))
      .where(eq(profileLayers.rulesetVersionId, id))
      .orderBy(asc(profiles.id)),
  ]);

  return {
    ...row,
    ruleCount: ruleRows.length,
    profiles: useRows,
    rules: ruleRows,
  };
}

export async function listSources(): Promise<SourceRow[]> {
  return getDb().select().from(sources).orderBy(asc(sources.id));
}

export async function listTemplates(): Promise<TemplateRow[]> {
  return getDb().select().from(templates).orderBy(asc(templates.name));
}

/**
 * The fixtures a template draws on: its `fixture`-typed params, resolved once per suggested
 * profile.
 *
 * A slug is not an identity — `goblin` is two actor fixtures, one scoped to each edition
 * (ADR-0027) — so the profile is what picks between them. `ruleset_scope` is a JSON column,
 * so the scope test happens here rather than in SQL; `fixtures_slug_idx` covers the rest.
 * `null` records a slug that resolves to nothing under that profile, which `content:lint`
 * treats as an error and this page should show rather than hide.
 */
export type FixtureUse = {
  param: string;
  slug: string;
  kind: FixtureRow['kind'];
  byProfile: { profile: string; fixture: FixtureRow | null }[];
};

export async function fixturesForTemplate(template: TemplateRow): Promise<FixtureUse[]> {
  const db = getDb();

  const wanted = Object.entries(template.paramsSchema).flatMap(([param, spec]) =>
    spec.type === 'fixture' ? [{ param, slug: spec.default, kind: spec.kind }] : [],
  );

  return Promise.all(
    wanted.map(async ({ param, slug, kind }) => {
      const candidates = await db
        .select()
        .from(fixtures)
        .where(and(eq(fixtures.slug, slug), eq(fixtures.kind, kind)));

      return {
        param,
        slug,
        kind,
        byProfile: template.suggestedProfiles.map((profile) => ({
          profile,
          fixture: candidates.find((row) => row.rulesetScope.includes(profile)) ?? null,
        })),
      };
    }),
  );
}
