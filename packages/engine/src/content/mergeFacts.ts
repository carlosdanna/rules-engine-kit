/**
 * A stack of packs' fact registries → the one flat list `evaluate` takes.
 *
 * `RulesetVersion.facts` is per pack, but `evaluate` builds one registry from a single array
 * and `createFactRegistry` throws on a duplicate path — so a layer that redeclares a path its
 * base already declared would fail at evaluation rather than at load. A redeclaration is
 * normal and harmless when the two agree (a layer repeating a path it reads), so the first
 * declaration wins; a genuine disagreement about a path's meaning is a content bug and is
 * reported as one.
 *
 * Lives in `src/` rather than beside the CLI's loader because the web app merges the same
 * registries out of the database (ADR-0030), and two merges would be two answers.
 */

import type { FactDefinition, RulesetVersion } from '../schema';

export class FactMergeError extends Error {
  readonly code = 'FACT_MERGE';
  readonly path: string;

  constructor(path: string, detail: string) {
    super(detail);
    this.name = 'FactMergeError';
    this.path = path;
  }
}

function describe(declaration: FactDefinition): string {
  return (
    `${declaration.type}${declaration.derived ? ' (derived)' : ''}` +
    `${declaration.nullable ? ' (nullable)' : ''}`
  );
}

/** `packs` in declared order, base first — the order `resolveProfile` takes (ADR-0018). */
export function mergeFacts(
  packs: readonly Pick<RulesetVersion, 'id' | 'facts'>[],
): FactDefinition[] {
  const facts = new Map<string, FactDefinition>();

  for (const pack of packs) {
    for (const fact of pack.facts) {
      const existing = facts.get(fact.path);
      if (existing === undefined) {
        facts.set(fact.path, fact);
      } else if (
        existing.type !== fact.type ||
        existing.derived !== fact.derived ||
        existing.nullable !== fact.nullable
      ) {
        throw new FactMergeError(
          fact.path,
          `fact '${fact.path}' is declared twice with different meanings: ` +
            `${describe(existing)} then ${describe(fact)} (in '${pack.id}')`,
        );
      }
    }
  }

  return [...facts.values()];
}
