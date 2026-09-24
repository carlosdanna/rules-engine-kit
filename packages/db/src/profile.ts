/**
 * A named profile, rebuilt from the seeded rows into what `evaluate` takes (ADR-0030).
 *
 * The app runs from the database rather than from `content/` on disk: a run must use the
 * content the pages around it display, and a profile a user builds on `/profiles` exists
 * only as rows. `ruleRow` in `seed/rows.ts` stores each authored entry in exactly one
 * shape, so reading it back is the inverse mapping, and `test/profile.test.ts` holds every
 * seeded profile to the hash it was seeded with.
 *
 * Rules are read back in `rule_key` order, not authored order — `rules` has no position
 * column. That is invisible to the resolved hash, because `resolveProfile` sorts, but it
 * means a pack rebuilt here does not reproduce `content_hash`, which is over the authored
 * document. Nothing here needs it to.
 */

import {
  type FactDefinition,
  mergeFacts,
  type ResolvedProfile,
  type RuleEntry,
  RulesetVersion,
  resolveProfile,
} from '@rules-engine-kit/engine';
import { asc, eq } from 'drizzle-orm';
import type { Db } from './client';
import { profileLayers, profiles } from './schema/profiles';
import { type RuleRow, type RulesetVersionRow, rules, rulesetVersions } from './schema/rulesets';
import { type SourceRow, sources } from './schema/sources';

/** The rows no longer describe a runnable profile; the remedy is always a reseed. */
export class StaleProfileError extends Error {
  readonly code = 'STALE_PROFILE';

  constructor(detail: string) {
    super(`${detail} — run \`pnpm db:reset\``);
    this.name = 'StaleProfileError';
  }
}

function ruleEntryFromRow(row: RuleRow): unknown {
  if (row.op === 'patch') return row.patch;
  if (row.op === 'disable') return { op: 'disable', key: row.ruleKey, reason: row.reason };
  return {
    op: row.op,
    key: row.ruleKey,
    phase: row.phase,
    priority: row.priority,
    label: row.label,
    description: row.description,
    tags: row.tags,
    condition: row.condition,
    effects: row.effects,
    citation: row.citation,
    interpretation: row.interpretation,
  };
}

/**
 * The name comes from `sources`, not `rulesets`: `rulesets.name` is last-pack-wins
 * (`docs/open-questions.md`, known defects), and `sources.name` is per edition. Parsed
 * rather than cast, so a row that does not describe a valid entry fails here, by name.
 */
export function rulesetVersionFromRows(
  version: RulesetVersionRow,
  source: SourceRow,
  ruleRows: readonly RuleRow[],
): RulesetVersion {
  const extendsRef =
    version.baseRulesetId === null || version.baseRange === null
      ? null
      : { id: version.baseRulesetId, range: version.baseRange };

  return RulesetVersion.parse({
    id: version.rulesetId,
    version: version.semver,
    name: source.name,
    kind: extendsRef === null ? 'base' : 'layer',
    extends: extendsRef,
    author: source.author,
    license: source.license,
    sourceUrl: source.url,
    attribution: source.attributionText,
    facts: version.facts,
    rules: ruleRows.map(ruleEntryFromRow) as RuleEntry[],
  });
}

export type LoadedResolvedProfile = {
  profile: ResolvedProfile;
  facts: FactDefinition[];
  /** `profiles.resolved_hash` as seeded; differs from `profile.hash` when the rows drifted. */
  storedHash: string;
};

export function loadResolvedProfile(db: Db, profileId: string): LoadedResolvedProfile {
  const row = db.select().from(profiles).where(eq(profiles.id, profileId)).all()[0];
  if (row === undefined) throw new Error(`no profile '${profileId}'`);

  const layers = db
    .select({ version: rulesetVersions, source: sources })
    .from(profileLayers)
    .innerJoin(rulesetVersions, eq(profileLayers.rulesetVersionId, rulesetVersions.id))
    .innerJoin(sources, eq(rulesetVersions.sourceId, sources.id))
    .where(eq(profileLayers.profileId, profileId))
    .orderBy(asc(profileLayers.position))
    .all();
  if (layers.length === 0) throw new StaleProfileError(`profile '${profileId}' has no layers`);

  const stack = layers.map(({ version, source }) => {
    // Every seeded pack declares facts; an empty registry is the migration default (ADR-0030).
    if (version.facts.length === 0) {
      throw new StaleProfileError(
        `'${version.id}' has no fact registry: the database was migrated but not reseeded`,
      );
    }
    const ruleRows = db
      .select()
      .from(rules)
      .where(eq(rules.rulesetVersionId, version.id))
      .orderBy(asc(rules.ruleKey))
      .all();
    return rulesetVersionFromRows(version, source, ruleRows);
  });

  return {
    profile: resolveProfile(stack),
    facts: mergeFacts(stack),
    storedHash: row.resolvedHash,
  };
}
