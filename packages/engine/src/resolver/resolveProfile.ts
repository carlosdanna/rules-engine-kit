/**
 * Layer merge: an ordered stack of ruleset versions becomes one rule list with a hash
 * (FR-2, FR-12, VR-2, VR-3, VR-4), following ADR-0009.
 *
 * Layers are applied in declared order, position 0 being the base, and the last op on a
 * key wins. Anything an author got wrong *within* a resolvable stack — a second `add`, an
 * `override` of a key nobody defined, a `patch` reaching a semantic field — is collected
 * as a `Conflict` and returned, never silently chosen for them. Only an incompatible base
 * range fails outright, with an `IncompatibleStackError`.
 *
 * The input is trusted to be schema-valid: packs are parsed when they are loaded
 * (`content:lint`, FR-17) and again when they are read out of the database, so this
 * function stays a pure merge rather than a second validator. The one exception is the
 * patch whitelist, which ADR-0009 asks to be enforced at resolve time as well.
 */

import { PHASES } from '../schema/primitives';
import type { Conflict, ResolvedRule, Rule, RuleEntry, RuleProvenance } from '../schema/rule';
import { PATCHABLE_RULE_FIELDS } from '../schema/rule';
import type { ProfileSource, ResolvedProfile, RulesetVersion } from '../schema/ruleset';
import { canonicalJson } from './canonical';
import { IncompatibleStackError } from './errors';
import { satisfiesRange } from './semver';
import { sha256Hex } from './sha256';

type WholeRuleEntry = Extract<RuleEntry, { op: 'add' | 'override' }>;
type PatchEntry = Extract<RuleEntry, { op: 'patch' }>;

/** A rule mid-merge: the body that is winning so far, plus what got it there. */
type Draft = {
  rule: Rule;
  enabled: boolean;
  provenance: RuleProvenance[];
};

const PATCHABLE = new Set<string>(PATCHABLE_RULE_FIELDS);

const PHASE_ORDER = new Map(PHASES.map((phase, index) => [phase, index]));

/**
 * Copied field by field so nothing from the entry — `op`, or anything a looser loader let
 * through — reaches the resolved rule or the hash, and so the caller's packs are never
 * aliased by the result (FR-3).
 */
function bodyOf(entry: WholeRuleEntry): Rule {
  return {
    key: entry.key,
    phase: entry.phase,
    priority: entry.priority,
    label: entry.label,
    description: entry.description,
    tags: [...entry.tags],
    condition: structuredClone(entry.condition),
    effects: structuredClone(entry.effects),
    citation: { ...entry.citation },
    interpretation: entry.interpretation,
  };
}

function applyPatch(rule: Rule, entry: PatchEntry): Rule {
  const patched: Rule = { ...rule };
  if ('priority' in entry && entry.priority !== undefined) patched.priority = entry.priority;
  if ('label' in entry && entry.label !== undefined) patched.label = entry.label;
  if ('description' in entry && entry.description !== undefined) {
    patched.description = entry.description;
  }
  if ('tags' in entry && entry.tags !== undefined) patched.tags = [...entry.tags];
  if ('citation' in entry && entry.citation !== undefined) patched.citation = { ...entry.citation };
  // `null` is a meaningful value here — "we read this one and it is not ambiguous".
  if ('interpretation' in entry && entry.interpretation !== undefined) {
    patched.interpretation = entry.interpretation;
  }
  return patched;
}

/** Fields a patch entry names that ADR-0009 does not let it touch. */
function forbiddenPatchFields(entry: PatchEntry): string[] {
  return Object.keys(entry).filter(
    (field) => field !== 'op' && field !== 'key' && !PATCHABLE.has(field),
  );
}

function applyEntry(
  drafts: Map<string, Draft>,
  conflicts: Conflict[],
  pack: RulesetVersion,
  entry: RuleEntry,
): void {
  const existing = drafts.get(entry.key);
  const provenance: RuleProvenance = { layer: pack.id, version: pack.version, op: entry.op };
  const report = (kind: Conflict['kind'], detail: string): void => {
    conflicts.push({ kind, ruleKey: entry.key, layer: pack.id, detail });
  };

  switch (entry.op) {
    case 'add': {
      if (existing !== undefined) {
        const previous = existing.provenance.at(-1);
        report(
          'duplicate-add',
          `already supplied by ${previous?.layer ?? 'an earlier layer'}@${previous?.version ?? '?'}; the later add wins, but say \`override\` if replacing the rule was the intent (VR-2)`,
        );
      }
      // A fresh body, so the rule is on again even if a layer below switched it off.
      drafts.set(entry.key, {
        rule: bodyOf(entry),
        enabled: true,
        provenance: [...(existing?.provenance ?? []), provenance],
      });
      return;
    }

    case 'override': {
      if (existing === undefined) {
        report(
          'override-missing',
          'no rule with this key in the layers below it; use `add` to introduce a new rule (FR-17)',
        );
        return;
      }
      drafts.set(entry.key, {
        rule: bodyOf(entry),
        enabled: true,
        provenance: [...existing.provenance, provenance],
      });
      return;
    }

    case 'patch': {
      if (existing === undefined) {
        report('patch-missing', 'no rule with this key in the layers below it (FR-17)');
        return;
      }
      const forbidden = forbiddenPatchFields(entry);
      if (forbidden.length > 0) {
        report(
          'patch-forbidden-field',
          `a patch may not change ${forbidden.join(', ')}: changing phase, condition or effects requires \`override\` (ADR-0009). The whole patch was skipped.`,
        );
        return;
      }
      drafts.set(entry.key, {
        rule: applyPatch(existing.rule, entry),
        enabled: existing.enabled,
        provenance: [...existing.provenance, provenance],
      });
      return;
    }

    case 'disable': {
      if (existing === undefined) {
        report('disable-missing', 'no rule with this key in the layers below it (FR-17)');
        return;
      }
      drafts.set(entry.key, {
        rule: existing.rule,
        enabled: false,
        provenance: [...existing.provenance, provenance],
      });
      return;
    }
  }
}

/** Phase, then priority, then key — the order the evaluator reads them in (FR-9). */
function compareRules(a: ResolvedRule, b: ResolvedRule): number {
  const phase = (PHASE_ORDER.get(a.phase) ?? 0) - (PHASE_ORDER.get(b.phase) ?? 0);
  if (phase !== 0) return phase;
  if (a.priority !== b.priority) return a.priority - b.priority;
  // Code-unit order, not `localeCompare`: the sort must not depend on the machine's locale.
  if (a.key === b.key) return 0;
  return a.key < b.key ? -1 : 1;
}

/**
 * Enabled rules sharing a phase and a priority still order deterministically, by key, but
 * nobody chose that order — so it is reported (ADR-0009).
 */
function priorityTies(rules: readonly ResolvedRule[]): Conflict[] {
  const groups = new Map<string, ResolvedRule[]>();
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const bucket = `${rule.phase}\u0000${rule.priority}`;
    const group = groups.get(bucket);
    if (group === undefined) groups.set(bucket, [rule]);
    else group.push(rule);
  }

  const conflicts: Conflict[] = [];
  for (const group of groups.values()) {
    const first = group[0];
    if (group.length < 2 || first === undefined) continue;
    conflicts.push({
      kind: 'priority-tie',
      ruleKey: first.key,
      layer:
        first.provenance[first.provenance.length - 1]?.layer ?? first.provenance[0]?.layer ?? '',
      detail: `phase ${first.phase} priority ${first.priority} is shared by ${group
        .map((rule) => rule.key)
        .join(', ')}; their order falls back to rule_key (FR-9)`,
    });
  }
  return conflicts;
}

/** VR-3: the stack itself has to make sense before any rule is merged. */
function assertResolvable(layers: readonly RulesetVersion[]): RulesetVersion {
  const base = layers[0];
  if (base === undefined) throw new IncompatibleStackError({ kind: 'empty-stack' });
  if (base.kind !== 'base' || base.extends !== null) {
    throw new IncompatibleStackError({
      kind: 'base-not-first',
      layer: base.id,
      version: base.version,
    });
  }

  const seen = new Set<string>([`${base.id}@${base.version}`]);
  for (let position = 1; position < layers.length; position++) {
    const pack = layers[position];
    if (pack === undefined) continue;
    const identity = { layer: pack.id, version: pack.version };

    if (pack.kind !== 'layer' || pack.extends === null) {
      throw new IncompatibleStackError({ kind: 'layer-expected', ...identity, position });
    }
    const key = `${pack.id}@${pack.version}`;
    if (seen.has(key)) {
      throw new IncompatibleStackError({ kind: 'duplicate-ruleset', ...identity, position });
    }
    seen.add(key);

    if (pack.extends.id !== base.id) {
      throw new IncompatibleStackError({
        kind: 'base-mismatch',
        ...identity,
        declared: pack.extends.id,
        base: base.id,
      });
    }

    const range = pack.extends.range;
    let covered: boolean;
    try {
      covered = satisfiesRange(base.version, range);
    } catch {
      throw new IncompatibleStackError({ kind: 'unsupported-range', ...identity, range });
    }
    if (!covered) {
      throw new IncompatibleStackError({
        kind: 'range-unsatisfied',
        ...identity,
        range,
        base: base.id,
        baseVersion: base.version,
      });
    }
  }

  return base;
}

/**
 * Merge an ordered stack of ruleset versions into one rule list with a hash.
 *
 * Throws `IncompatibleStackError` if the stack cannot be resolved at all; every other
 * problem comes back in `conflicts`.
 */
export function resolveProfile(layers: readonly RulesetVersion[]): ResolvedProfile {
  assertResolvable(layers);

  const drafts = new Map<string, Draft>();
  const conflicts: Conflict[] = [];
  for (const pack of layers) {
    for (const entry of pack.rules) {
      applyEntry(drafts, conflicts, pack, entry);
    }
  }

  const rules: ResolvedRule[] = [...drafts.values()]
    .map((draft) => ({ ...draft.rule, enabled: draft.enabled, provenance: draft.provenance }))
    .sort(compareRules);
  conflicts.push(...priorityTies(rules));

  const sources: ProfileSource[] = layers.map((pack) => ({
    layer: pack.id,
    version: pack.version,
  }));

  // The ordered rules plus the layer identities, so the hash moves when a patch changes a
  // priority and when the same rules come from a different stack (ADR-0009, VR-7).
  const hash = `sha256:${sha256Hex(canonicalJson({ rules, sources }))}`;

  return { rules, hash, sources, conflicts };
}
