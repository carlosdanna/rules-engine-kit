/**
 * Shapes used by the resolver tests. These are *not* content: the rules are the smallest
 * bodies that exercise the merge, not SRD mechanics, and nothing here is seeded. Real
 * packs live in `content/` and are checked against the SRD (see `CONTRIBUTING.md`).
 */

import type { Phase, Rule, RuleEntry, RulesetVersion } from '../../src/index';

export const BASE_ID = 'dnd5e-srd';
export const BASE_VERSION = '5.2.1';
export const HOUSE_ID = 'house-rules';

/** A rule body with everything required, so a test only states what it cares about. */
export function rule(key: string, overrides: Partial<Rule> = {}): Rule {
  return {
    key,
    phase: 'modifiers',
    priority: 100,
    label: key,
    description: `Body of ${key}.`,
    tags: [],
    condition: null,
    effects: [],
    citation: { source: 'srd-5.2.1', section: 'Rules Glossary' },
    interpretation: null,
    ...overrides,
  };
}

export function add(key: string, overrides: Partial<Rule> = {}): RuleEntry {
  return { op: 'add', ...rule(key, overrides) };
}

export function override(key: string, overrides: Partial<Rule> = {}): RuleEntry {
  return { op: 'override', ...rule(key, overrides) };
}

export function disable(key: string, reason: string | null = null): RuleEntry {
  return { op: 'disable', key, reason };
}

/** A base pack. `extends` is null and `kind` is `base`, as VR-3 requires. */
export function base(rules: RuleEntry[], overrides: Partial<RulesetVersion> = {}): RulesetVersion {
  return {
    id: BASE_ID,
    version: BASE_VERSION,
    name: 'SRD 5.2.1',
    kind: 'base',
    extends: null,
    author: 'Wizards of the Coast LLC',
    license: 'CC-BY-4.0',
    sourceUrl: 'https://www.dndbeyond.com/srd',
    attribution: 'This work includes material from the System Reference Document 5.2.1.',
    facts: [],
    rules,
    ...overrides,
  };
}

/** A layer over the base, compatible with it unless a test says otherwise. */
export function layer(rules: RuleEntry[], overrides: Partial<RulesetVersion> = {}): RulesetVersion {
  return {
    id: HOUSE_ID,
    version: '1.0.0',
    name: 'House rules',
    kind: 'layer',
    extends: { id: BASE_ID, range: '^5.2.0' },
    author: 'rules-engine-kit contributors',
    license: 'CC-BY-4.0',
    sourceUrl: 'https://example.invalid/house-rules',
    attribution: 'House rules written for this demo.',
    facts: [],
    rules,
    ...overrides,
  };
}

export const PHASE_MODIFIERS: Phase = 'modifiers';
