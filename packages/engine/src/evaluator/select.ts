/**
 * Choosing and ordering the rules a phase runs (FR-9).
 *
 * `resolveProfile` already sorts, but `evaluate` can be handed a profile rehydrated from
 * SQLite, so this sorts defensively — through the resolver's own comparator, so FR-9's
 * ordering has exactly one definition in the codebase and one thing to test.
 */

import { compareResolvedRules } from '../resolver';
import type { Phase, ResolvedRule, RuleProvenance } from '../schema';

export function selectRules(rules: readonly ResolvedRule[], phase: Phase): readonly ResolvedRule[] {
  return rules.filter((rule) => rule.phase === phase).sort(compareResolvedRules);
}

/** The layer that last spoke about this rule — what the trace records as its provenance. */
export function lastProvenance(rule: ResolvedRule): RuleProvenance {
  const provenance = rule.provenance[rule.provenance.length - 1];
  if (provenance === undefined) {
    // `ResolvedRule.provenance` is `min(1)`, so this is unreachable through the schema.
    throw new Error(`rule '${rule.key}' has no provenance`);
  }
  return provenance;
}

/** Which layer disabled a rule, for `SkipReason.disabledByLayer` (ADR-0009). */
export function disablingLayer(rule: ResolvedRule): string {
  for (let index = rule.provenance.length - 1; index >= 0; index--) {
    const entry = rule.provenance[index];
    if (entry?.op === 'disable') return entry.layer;
  }
  return lastProvenance(rule).layer;
}
