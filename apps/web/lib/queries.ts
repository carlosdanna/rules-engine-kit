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
  type EvaluationRow,
  evaluations,
  type FixtureRow,
  fixtures,
  type ProfileRow,
  profileLayers,
  profiles,
  type RuleRow,
  type RulesetRow,
  type RulesetVersionRow,
  rules,
  rulesets,
  rulesetVersions,
  type ScenarioRow,
  type SourceRow,
  scenarios,
  sources,
  type TemplateRow,
  templates,
  versionId,
} from '@rules-engine-kit/db';
import type { Fixture } from '@rules-engine-kit/engine';
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

/* ------------------------------------------------------------------ scenarios (FR-18) */

/**
 * Every scenario, seeded and user, newest-looking first is not an option: there are no
 * timestamp columns anywhere by design (`packages/db/src/schema/index.ts`), so the only
 * stable order is the slug. Seeded rows sort in beside user rows rather than above them —
 * which is which is a column, and the list says so.
 */
export async function listScenarios(): Promise<ScenarioRow[]> {
  return getDb().select().from(scenarios).orderBy(asc(scenarios.id));
}

/** `null` when the slug names no row, which the page turns into a 404. */
export async function getScenario(slug: string): Promise<ScenarioRow | null> {
  const row = (await getDb().select().from(scenarios).where(eq(scenarios.id, slug)).limit(1))[0];
  return row ?? null;
}

/**
 * Every id in the table, for minting one that is not taken (ADR-0029).
 *
 * Seeded and user both: `db:reset` re-inserts the six seeded slugs, so a user row that took
 * one would collide with content on its way back.
 */
export async function takenScenarioIds(): Promise<Set<string>> {
  const rows = await getDb().select({ id: scenarios.id }).from(scenarios);
  return new Set(rows.map((row) => row.id));
}

export async function getTemplate(id: string): Promise<TemplateRow | null> {
  const row = (await getDb().select().from(templates).where(eq(templates.id, id)).limit(1))[0];
  return row ?? null;
}

export async function listProfiles(): Promise<ProfileRow[]> {
  return getDb().select().from(profiles).orderBy(asc(profiles.id));
}

/**
 * Every fixture, as the engine's `Fixture` rather than as a row.
 *
 * `buildFixtureIndex` wants engine values, and a `FixtureRow` is one plus the two columns the
 * database needs to address it — so the mapping is a drop, not a conversion. All of them are
 * returned rather than one profile's: the form's profile picker changes which variant resolves
 * (ADR-0026), and re-fetching on every change would put a server round-trip inside a control
 * that has to feel immediate.
 *
 * `fixturesForTemplate` above cannot serve this: it resolves each param's *declared default*
 * slug, which is what `/templates` documents, not the full list a picker offers.
 */
export async function listFixtures(): Promise<Fixture[]> {
  const rows = await getDb().select().from(fixtures).orderBy(asc(fixtures.slug));
  return rows.map(({ id: _id, sourceId: _sourceId, ...fixture }) => fixture as Fixture);
}

/**
 * The condition names a `conditionList` param suggests.
 *
 * Nothing enumerates conditions — `packages/engine/src/conditions/` is the JSON Logic
 * evaluator, not a catalogue of statuses — so they are read off the rule keys that mention
 * one: `condition.prone.attacked` contributes `prone`. Suggestions only; the control takes
 * free text, because a house rule may name a condition no seeded rule does.
 */
export async function conditionNames(): Promise<string[]> {
  const rows = await getDb().select({ ruleKey: rules.ruleKey }).from(rules);
  const names = new Set<string>();
  for (const { ruleKey } of rows) {
    const match = /^condition\.([^.]+)\./.exec(ruleKey);
    if (match?.[1] !== undefined) names.add(match[1]);
  }
  return [...names].sort();
}

/* ---------------------------------------------------------------- evaluations (VR-7) */

/** `null` when the id names no run, which the page turns into a 404. */
export async function getEvaluation(id: string): Promise<EvaluationRow | null> {
  const row = (await getDb().select().from(evaluations).where(eq(evaluations.id, id)).limit(1))[0];
  return row ?? null;
}

export async function getProfile(id: string): Promise<ProfileRow | null> {
  const row = (await getDb().select().from(profiles).where(eq(profiles.id, id)).limit(1))[0];
  return row ?? null;
}
