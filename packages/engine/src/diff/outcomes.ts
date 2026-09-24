/**
 * `diffOutcomes` (FR-16): what two runs came to, compared value by value.
 *
 * Everything is aligned on a key the outcome already carries, never on position: steps on
 * `stepId`, rolls and comparisons on `rollId`, damage and actors on the actor, derived values
 * on `(stepId, actorId, path)` — the key ADR-0019 added `DerivedValue.stepId` for. A path
 * names the value the way a reader would look for it: `steps[r1-guard].halted`.
 *
 * The identity fields — seed, profile hash, engine version — are reported apart from the
 * values. `/compare` runs two different profiles on purpose, so their hashes differing is the
 * premise, not a finding.
 */

import type { Outcome } from '../schema';
import { keyed, present, same, unionKeys } from './align';

export type ValueDiff = { path: string; a: unknown; b: unknown };

type Pair<T> = { a: T; b: T };

export type OutcomeDiff = {
  /** No value differs and nothing is present on one side only. Identity is not counted. */
  identical: boolean;
  identity: {
    seed: Pair<string>;
    profileHash: Pair<string>;
    engineVersion: Pair<string>;
  };
  /** Present on both sides with a different value, in step order. */
  values: ValueDiff[];
  /** Paths to whole things — a step, a roll, a damage record — that only one side has. */
  onlyA: string[];
  onlyB: string[];
};

type Collector = { values: ValueDiff[]; onlyA: string[]; onlyB: string[] };

function compareFields<T extends object>(
  out: Collector,
  path: string,
  a: T,
  b: T,
  fields: readonly (keyof T & string)[],
): void {
  for (const field of fields) {
    if (!same(a[field], b[field])) {
      out.values.push({ path: `${path}.${field}`, a: present(a[field]), b: present(b[field]) });
    }
  }
}

/** Align two lists on `keyOf`, record one-sided entries, and hand the pairs to `each`. */
function alignList<T>(
  out: Collector,
  path: string,
  a: readonly T[],
  b: readonly T[],
  keyOf: (item: T) => string,
  each: (itemPath: string, a: T, b: T) => void,
): void {
  const left = keyed(a, keyOf);
  const right = keyed(b, keyOf);
  for (const key of unionKeys(left, right)) {
    const itemPath = `${path}[${key}]`;
    const x = left.get(key);
    const y = right.get(key);
    if (x === undefined) out.onlyB.push(itemPath);
    else if (y === undefined) out.onlyA.push(itemPath);
    else each(itemPath, x, y);
  }
}

export function diffOutcomes(a: Outcome, b: Outcome): OutcomeDiff {
  const out: Collector = { values: [], onlyA: [], onlyB: [] };

  alignList(
    out,
    'steps',
    a.steps,
    b.steps,
    (step) => step.stepId,
    (path, x, y) => {
      compareFields(out, path, x, y, ['round', 'actorId', 'halted']);
      alignList(
        out,
        `${path}.rolls`,
        x.rolls,
        y.rolls,
        (roll) => roll.rollId,
        (p, r, s) => compareFields(out, p, r, s, ['mode', 'kept', 'modifiers', 'total', 'forced']),
      );
      alignList(
        out,
        `${path}.comparisons`,
        x.comparisons,
        y.comparisons,
        (c) => c.rollId ?? `${c.target.kind}:${c.target.actorId}`,
        (p, c, d) => compareFields(out, p, c, d, ['total', 'dc', 'result']),
      );
      alignList(
        out,
        `${path}.damage`,
        x.damage,
        y.damage,
        (d) => d.actorId,
        (p, d, e) => compareFields(out, p, d, e, ['damageType', 'amount', 'hpAfter', 'overflow']),
      );
    },
  );

  alignList(
    out,
    'finalState.actors',
    Object.values(a.finalState.actors),
    Object.values(b.finalState.actors),
    (actor) => actor.id,
    (path, x, y) => compareFields(out, path, x, y, ['hpCurrent', 'conditions']),
  );

  alignList(
    out,
    'finalState.activeEffects',
    a.finalState.activeEffects,
    b.finalState.activeEffects,
    (effect) => effect.id,
    (path, x, y) => {
      if (!same(x, y)) out.values.push({ path, a: x, b: y });
    },
  );

  alignList(
    out,
    'derived',
    a.derived,
    b.derived,
    (d) => `${d.stepId}/${d.actorId}/${d.path}`,
    (path, x, y) => compareFields(out, path, x, y, ['base', 'terms', 'total']),
  );

  alignList(
    out,
    'events',
    a.events,
    b.events,
    (e) => `${e.stepId}/${e.event}`,
    (path, x, y) => compareFields(out, path, x, y, ['data']),
  );

  return {
    identical: out.values.length === 0 && out.onlyA.length === 0 && out.onlyB.length === 0,
    identity: {
      seed: { a: a.seed, b: b.seed },
      profileHash: { a: a.profileHash, b: b.profileHash },
      engineVersion: { a: a.engineVersion, b: b.engineVersion },
    },
    ...out,
  };
}
