import { z } from 'zod';
import type { FactDefinition, FactType, Json } from '../schema';
import { DuplicateFactError } from './errors';

/**
 * A fact path bound to the Zod type its value must have. The type is load-bearing, not
 * documentation — evaluation parses through it, so a fact that changes shape fails loudly
 * instead of comparing as `undefined`.
 *
 * `FactDefinition` (`schema/ruleset.ts`) is the *authored* form of the same thing, with a
 * closed `FactType` enum because YAML cannot carry a Zod schema. `registryFromFacts`
 * converts one to the other; `createFactRegistry` also takes arbitrary Zod types directly,
 * which is what derived facts (ADR-0006) and tests need.
 */
export type RegisteredFact = {
  path: string;
  type: z.ZodType;
  /** Shown by `content:lint` and the `/rulesets` browser. */
  description?: string;
};

export type FactRegistry = {
  has(path: string): boolean;
  get(path: string): RegisteredFact | undefined;
  /** In registration order. */
  paths(): string[];
};

/**
 * Where values come from. Injected rather than folded into the registry because the
 * registry is pack content while the values belong to one evaluation, and because
 * ADR-0006 derives most stats on demand rather than materialising them.
 */
export type FactSource = {
  read(path: string): Json;
};

/** The five types a pack can declare in `facts.yaml`, as schemas the evaluator can parse with. */
export function factTypeSchema(type: FactType): z.ZodType {
  switch (type) {
    case 'number':
      return z.number();
    case 'string':
      return z.string();
    case 'boolean':
      return z.boolean();
    case 'numberList':
      return z.array(z.number());
    case 'stringList':
      return z.array(z.string());
  }
}

export function createFactRegistry(facts: readonly RegisteredFact[]): FactRegistry {
  const byPath = new Map<string, RegisteredFact>();
  for (const fact of facts) {
    if (byPath.has(fact.path)) {
      throw new DuplicateFactError(fact.path);
    }
    byPath.set(fact.path, fact);
  }

  return {
    has: (path) => byPath.has(path),
    get: (path) => byPath.get(path),
    paths: () => [...byPath.keys()],
  };
}

/** Builds the registry straight from a pack's `facts` (`RulesetVersion.facts`). */
export function registryFromFacts(facts: readonly FactDefinition[]): FactRegistry {
  return createFactRegistry(
    facts.map((fact) => ({
      path: fact.path,
      type: factTypeSchema(fact.type),
      description: fact.description,
    })),
  );
}
