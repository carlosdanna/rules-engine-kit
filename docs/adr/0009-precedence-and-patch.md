# ADR-0009: Layer precedence by op, with `patch` limited to non-semantic fields

- Status: accepted
- Date: 2026-09-21

## Context
Q5. VR-2 gives layers four ops (`add`, `override`, `patch`, `disable`) and VR-4 says layer order is explicit and last wins, but the merge algorithm and the reach of `patch` are undefined. `patch` is the risky one: if it can rewrite a condition or an effect, a house-rule layer can change what a rule means without that change being visible as a rule body, which undermines the version-diff feature (VR-9).

## Options

1. **Whole-rule replacement only.** Any layer touching a key restates the full rule.
   - Pros: one code path, trivially explainable provenance.
   - Cons: a house rule that only bumps a priority or adds a tag must copy the whole rule, and the diff then shows noise instead of the one real change.

2. **Op-based merge with a patch whitelist (recommended).** The four ops keep their distinct meanings, and `patch` may only touch fields that do not change what the rule decides. Semantic changes must be an `override`, so a full rule body always exists to diff against.
   - Pros: satisfies VR-2 and VR-9 together; conflicts are nameable and reportable; provenance stays per-field-free and simple.
   - Cons: authors occasionally have to restate a rule body when a shorter patch would have done.

3. **Deep merge / JSON Patch on any field.** Layers apply arbitrary patches to any part of a rule.
   - Pros: most expressive, least duplication.
   - Cons: a one-line patch can invert a condition; diffs and "why did this fire" become archaeology across layers.

```ts
type RuleOp = 'add' | 'override' | 'patch' | 'disable';

const PATCHABLE = ['priority', 'label', 'description', 'tags', 'citation', 'interpretation'] as const;
type PatchableField = (typeof PATCHABLE)[number];
// NOT patchable: phase, condition, effects — those require `override`.

type ResolvedRule = Rule & {
  enabled: boolean;                                     // false when disabled by a layer
  provenance: { layer: string; version: string; op: RuleOp }[];  // base first, last wins
};

type Conflict = {
  kind: 'duplicate-add' | 'override-missing' | 'patch-missing'
      | 'patch-forbidden-field' | 'disable-missing' | 'priority-tie';
  ruleKey: string;
  layer: string;
  detail: string;
};

type ResolvedProfile = {
  rules: ResolvedRule[];          // ordered by phase, then priority, then rule_key
  hash: string;                   // canonical JSON of rules + ordered layer identities
  sources: { layer: string; version: string }[];
  conflicts: Conflict[];
};
```

Algorithm: layers are applied in declared order, position 0 being the base.
- `add` — key must not already exist, else `duplicate-add`.
- `override` — key must exist; replaces the whole rule body, keeping `rule_key`. Missing key is `override-missing`.
- `patch` — key must exist and only whitelisted fields may appear. Violations are `patch-missing` / `patch-forbidden-field`.
- `disable` — key must exist; the rule stays in the resolved list with `enabled: false` so "why not" can name the layer that disabled it.

Conflicts are collected and returned, not thrown, so the `/profiles` page can show them (FR-12). Only an incompatible base range fails resolution outright (VR-3).

## Decision
Option 2. `patch` is restricted to `priority`, `label`, `description`, `tags`, `citation` and `interpretation`; `phase`, `condition` and `effects` require `override`. Disabled rules remain in the resolved list, flagged. Every resolved rule carries ordered provenance, and the profile hash is the canonical JSON of the ordered resolved rules plus the layer identities.

## Consequences
- The resolver rejects a forbidden patch at load time (`content:lint`, FR-17) as well as at resolve time.
- VR-4's "which layer supplied each rule" is answered by `provenance`; VR-9's version diff compares resolved rule bodies.
- Keeping disabled rules in the list makes the resolved list a superset of the active rules, so the evaluator must check `enabled` before considering a rule.
- A profile hash changes whenever a patch changes a priority, which is correct: ordering is part of the result.
- `content-authoring.md` gains the patch whitelist next to the `op` field.
