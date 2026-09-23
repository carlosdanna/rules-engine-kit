/**
 * Every seeded row's primary key, in one place (ADR-0027).
 *
 * They are deterministic functions of the content, never counters, which is what makes
 * reseeding idempotent and what lets a user evaluation keep pointing at the scenario it ran
 * after `db:reset` has deleted and rewritten that scenario's row.
 */

import type { Fixture, RulesetVersion } from '@rules-engine-kit/engine';

/** `dnd5e-srd@5.2.1`: a pack version, and the source it is attributed to. */
export const versionId = (rulesetId: string, semver: string): string => `${rulesetId}@${semver}`;

export const packVersionId = (pack: RulesetVersion): string => versionId(pack.id, pack.version);

/** `dnd5e-srd@5.2.1#condition.prone.attacked`: one entry per rule key per version. */
export const ruleId = (rulesetVersionId: string, ruleKey: string): string =>
  `${rulesetVersionId}#${ruleKey}`;

/**
 * `actor:goblin:srd-5.1`. The scope is in the key because the slug is not one: `goblin` is two
 * stat blocks, one per edition (ADR-0026), and they are two rows.
 */
export const fixtureId = (fixture: Fixture): string =>
  `${fixture.kind}:${fixture.slug}:${[...fixture.rulesetScope].sort().join('+')}`;
