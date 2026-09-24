/**
 * `mergeFacts` turns a stack of packs' registries into the one flat list `evaluate` takes.
 * The CLI, the golden harness and the web app all go through it, so a layer that repeats a
 * path its base declared must be harmless and a genuine disagreement must be loud.
 */

import { describe, expect, it } from 'vitest';
import { FactMergeError, mergeFacts } from '../../src/content';
import type { FactDefinition } from '../../src/schema';

const fact = (path: string, overrides: Partial<FactDefinition> = {}): FactDefinition => ({
  path,
  type: 'number',
  description: `the ${path}`,
  derived: false,
  nullable: false,
  ...overrides,
});

describe('mergeFacts', () => {
  it('concatenates disjoint registries in stack order', () => {
    const merged = mergeFacts([
      { id: 'base', facts: [fact('actor.hp'), fact('actor.ac')] },
      { id: 'layer', facts: [fact('actor.flanked', { type: 'boolean' })] },
    ]);
    expect(merged.map((f) => f.path)).toEqual(['actor.hp', 'actor.ac', 'actor.flanked']);
  });

  it('keeps the first declaration when a layer repeats an agreeing path', () => {
    const merged = mergeFacts([
      { id: 'base', facts: [fact('actor.hp', { description: 'base wording' })] },
      { id: 'layer', facts: [fact('actor.hp', { description: 'layer wording' })] },
    ]);
    expect(merged).toEqual([fact('actor.hp', { description: 'base wording' })]);
  });

  it.each([
    ['type', { type: 'string' as const }],
    ['derived', { derived: true }],
    ['nullable', { nullable: true }],
  ])('refuses a redeclaration that disagrees on %s', (_field, overrides) => {
    const stack = [
      { id: 'base', facts: [fact('actor.hp')] },
      { id: 'layer', facts: [fact('actor.hp', overrides)] },
    ];
    expect(() => mergeFacts(stack)).toThrow(FactMergeError);
    expect(() => mergeFacts(stack)).toThrow(/actor\.hp.*declared twice/);
  });

  it('returns an empty registry for an empty stack', () => {
    expect(mergeFacts([])).toEqual([]);
  });
});
