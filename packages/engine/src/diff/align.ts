/**
 * The one alignment every diff here uses: key both sides, walk the union.
 *
 * A key that repeats on one side is numbered — `goblin`, `goblin#2` — rather than collapsed,
 * so two hits on the same actor in one step stay two things to compare. Equality is canonical
 * JSON, as the replay comparison and the profile hash use (ADR-0009): two documents that
 * differ only in key order are the same document.
 */

import { canonicalJson } from '../resolver/canonical';

export function keyed<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T> {
  const seen = new Map<string, number>();
  const out = new Map<string, T>();
  for (const item of items) {
    const base = keyOf(item);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    out.set(n === 1 ? base : `${base}#${n}`, item);
  }
  return out;
}

/** A's keys in A's order, then B's keys A does not have, in B's order. */
export function unionKeys<T>(a: Map<string, T>, b: Map<string, T>): string[] {
  return [...a.keys(), ...[...b.keys()].filter((key) => !a.has(key))];
}

/** An absent optional field reads as `null`, so it is JSON and it compares. */
export const present = (value: unknown): unknown => (value === undefined ? null : value);

export function same(a: unknown, b: unknown): boolean {
  return canonicalJson(present(a)) === canonicalJson(present(b));
}
