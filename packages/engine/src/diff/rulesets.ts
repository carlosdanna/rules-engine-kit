/**
 * `diffRulesets` (VR-9): what two ruleset versions *author*, entry by entry.
 *
 * This is the authored diff, not the resolved one: it answers "what did SRD 5.2.1 change
 * from 5.1?", which is a question about packs. What a stack of layers produces is
 * `resolveProfile`'s, and `/compare` shows its consequence on a run.
 *
 * Entries are keyed on `rule_key`. A field one entry has and the other does not — `reason`
 * on a `disable`, `condition` on an `add` — is reported with `null` on the side without it.
 */

import type { RuleEntry, RulesetVersion } from '../schema';
import { keyed, present, same } from './align';

export type FieldDiff = { field: string; a: unknown; b: unknown };

export type RulesetDiff = {
  a: { id: string; version: string };
  b: { id: string; version: string };
  /** In `b` and not in `a`, by `rule_key`. */
  added: RuleEntry[];
  /** In `a` and not in `b`. */
  removed: RuleEntry[];
  changed: { key: string; a: RuleEntry; b: RuleEntry; fields: FieldDiff[] }[];
  unchanged: number;
};

/** Reading order for a changed entry: what it does before how it is described. */
const FIELD_ORDER = [
  'op',
  'phase',
  'priority',
  'condition',
  'effects',
  'label',
  'description',
  'tags',
  'citation',
  'interpretation',
  'reason',
];

function rank(field: string): number {
  const index = FIELD_ORDER.indexOf(field);
  return index === -1 ? FIELD_ORDER.length : index;
}

function fieldDiffs(a: RuleEntry, b: RuleEntry): FieldDiff[] {
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  return [...new Set([...Object.keys(x), ...Object.keys(y)])]
    .filter((field) => field !== 'key' && !same(x[field], y[field]))
    .sort((p, q) => rank(p) - rank(q) || (p < q ? -1 : p > q ? 1 : 0))
    .map((field) => ({ field, a: present(x[field]), b: present(y[field]) }));
}

const byKey = (p: string, q: string) => (p < q ? -1 : p > q ? 1 : 0);

export function diffRulesets(a: RulesetVersion, b: RulesetVersion): RulesetDiff {
  const left = keyed(a.rules, (entry) => entry.key);
  const right = keyed(b.rules, (entry) => entry.key);
  const keys = [...new Set([...left.keys(), ...right.keys()])].sort(byKey);

  const diff: RulesetDiff = {
    a: { id: a.id, version: a.version },
    b: { id: b.id, version: b.version },
    added: [],
    removed: [],
    changed: [],
    unchanged: 0,
  };

  for (const key of keys) {
    const x = left.get(key);
    const y = right.get(key);
    if (x === undefined && y !== undefined) diff.added.push(y);
    else if (y === undefined && x !== undefined) diff.removed.push(x);
    else if (x !== undefined && y !== undefined) {
      const fields = fieldDiffs(x, y);
      if (fields.length === 0) diff.unchanged++;
      else diff.changed.push({ key: x.key, a: x, b: y, fields });
    }
  }
  return diff;
}
