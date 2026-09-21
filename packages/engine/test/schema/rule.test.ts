import { describe, expect, it } from 'vitest';
import {
  Condition,
  PATCHABLE_RULE_FIELDS,
  ResolvedProfile,
  ResolvedRule,
  Rule,
  RuleEntry,
  RulesetVersion,
} from '../../src/index';
import { resolvedProfile, rule, rulesetVersion } from './fixtures';

describe('Rule', () => {
  it('accepts a rule with a condition, an effect and a citation', () => {
    const parsed = Rule.parse(rule);

    expect(parsed.phase).toBe('modifiers');
    expect(parsed.effects[0]?.type).toBe('rollMode');
  });

  it('requires a citation on every rule (CONTRIBUTING.md, NFR-6)', () => {
    const uncited = structuredClone(rule) as Record<string, unknown>;
    delete uncited.citation;

    expect(Rule.safeParse(uncited).success).toBe(false);
  });

  it('rejects a phase that is not one of the eight', () => {
    expect(Rule.safeParse({ ...rule, phase: 'initiative' }).success).toBe(false);
  });

  it('allows a null condition, meaning the rule always applies once selected', () => {
    expect(Rule.parse({ ...rule, condition: null }).condition).toBeNull();
  });

  it('requires interpretation to be explicit, null or a note, never absent', () => {
    const missing = structuredClone(rule) as Record<string, unknown>;
    delete missing.interpretation;

    expect(Rule.safeParse(missing).success).toBe(false);
  });
});

describe('Condition', () => {
  it('accepts the JSON Logic subset FR-6 names', () => {
    expect(Condition.safeParse({ '==': [{ var: 'actor.surprised' }, true] }).success).toBe(true);
    expect(Condition.safeParse({ in: ['prone', { var: 'target.conditions' }] }).success).toBe(true);
    expect(Condition.safeParse({ not: { '>=': [{ var: 'action.rangeFt' }, 5] } }).success).toBe(
      true,
    );
    expect(
      Condition.safeParse({ any: [{ '<': [{ var: 'a' }, 1] }, { '!=': [{ var: 'b' }, null] }] })
        .success,
    ).toBe(true);
  });

  it('nests to arbitrary depth', () => {
    const nested = {
      all: [{ any: [{ not: { '==': [{ var: 'actor.prone' }, true] } }] }],
    };

    expect(Condition.safeParse(nested).success).toBe(true);
  });

  it('rejects an operator outside the subset rather than letting it reach the evaluator', () => {
    expect(Condition.safeParse({ '+': [1, 2] }).success).toBe(false);
    expect(Condition.safeParse({ missing: ['actor.prone'] }).success).toBe(false);
  });

  it('rejects a bare var: conditions are strict, with no truthiness coercion (ADR-0013)', () => {
    expect(Condition.safeParse({ var: 'actor.prone' }).success).toBe(false);
  });

  it('rejects an empty var path, which no fact registry could resolve', () => {
    expect(Condition.safeParse({ '==': [{ var: '' }, true] }).success).toBe(false);
  });

  it('rejects a comparison that is not exactly two operands', () => {
    expect(Condition.safeParse({ '==': [{ var: 'a' }] }).success).toBe(false);
    expect(Condition.safeParse({ '==': [{ var: 'a' }, 1, 2] }).success).toBe(false);
  });

  it('rejects an empty all/any, which has no defensible verdict', () => {
    expect(Condition.safeParse({ all: [] }).success).toBe(false);
  });
});

describe('RuleEntry ops (ADR-0009)', () => {
  it('accepts add and override carrying a whole rule body', () => {
    expect(RuleEntry.safeParse({ op: 'add', ...rule }).success).toBe(true);
    expect(RuleEntry.safeParse({ op: 'override', ...rule }).success).toBe(true);
  });

  it('accepts a patch that touches only whitelisted fields', () => {
    const patch = {
      op: 'patch',
      key: rule.key,
      label: 'Use an Object',
      priority: 50,
    };

    expect(RuleEntry.safeParse(patch).success).toBe(true);
  });

  it('accepts a patch of any single whitelisted field', () => {
    const values: Record<(typeof PATCHABLE_RULE_FIELDS)[number], unknown> = {
      priority: 10,
      label: 'Utilize',
      description: 'Renamed in SRD 5.2.1.',
      tags: ['action'],
      citation: { source: 'srd-5.2.1', section: 'Rules Glossary > Utilize' },
      interpretation: null,
    };

    for (const field of PATCHABLE_RULE_FIELDS) {
      const result = RuleEntry.safeParse({ op: 'patch', key: rule.key, [field]: values[field] });

      expect(result.success, `patching ${field}`).toBe(true);
    }
  });

  it('rejects a patch of phase, condition or effects: those require an override (VR-2)', () => {
    for (const forbidden of [{ phase: 'roll' }, { condition: null }, { effects: [] }]) {
      // Paired with a legal change, so the rejection is the whitelist and not the
      // "a patch must change something" rule below.
      const result = RuleEntry.safeParse({
        op: 'patch',
        key: rule.key,
        label: 'Utilize',
        ...forbidden,
      });

      expect(result.success, Object.keys(forbidden)[0]).toBe(false);
    }
  });

  it('rejects a patch that changes nothing', () => {
    expect(RuleEntry.safeParse({ op: 'patch', key: rule.key }).success).toBe(false);
  });

  it('accepts a disable carrying nothing but the key and a reason', () => {
    const disabled = RuleEntry.parse({ op: 'disable', key: rule.key, reason: 'house rule' });

    expect(disabled.op).toBe('disable');
  });

  it('rejects an unknown op', () => {
    expect(RuleEntry.safeParse({ op: 'replace', key: rule.key }).success).toBe(false);
  });
});

describe('ResolvedRule', () => {
  it('keeps a disabled rule in the list so "why not" can name the layer (VR-4)', () => {
    const disabled = ResolvedRule.parse({
      ...rule,
      enabled: false,
      provenance: [
        { layer: 'dnd5e-srd', version: '5.2.1', op: 'add' },
        { layer: 'house-flanking', version: '1.0.0', op: 'disable' },
      ],
    });

    expect(disabled.enabled).toBe(false);
    expect(disabled.provenance.at(-1)?.op).toBe('disable');
  });

  it('requires at least one provenance entry: every rule came from somewhere', () => {
    expect(ResolvedRule.safeParse({ ...rule, enabled: true, provenance: [] }).success).toBe(false);
  });
});

describe('RulesetVersion', () => {
  it('accepts a base pack with its licence and attribution', () => {
    expect(RulesetVersion.parse(rulesetVersion).kind).toBe('base');
  });

  it('accepts a layer that declares the base it extends (VR-3)', () => {
    const layer = {
      ...rulesetVersion,
      id: 'house-flanking',
      version: '1.0.0',
      name: 'House rule: flanking',
      kind: 'layer',
      extends: { id: 'dnd5e-srd', range: '^5.2.0' },
    };

    expect(RulesetVersion.safeParse(layer).success).toBe(true);
  });

  it('rejects a layer with no base, and a base that claims one', () => {
    expect(RulesetVersion.safeParse({ ...rulesetVersion, kind: 'layer' }).success).toBe(false);
    expect(
      RulesetVersion.safeParse({
        ...rulesetVersion,
        extends: { id: 'dnd5e-srd', range: '^5.2.0' },
      }).success,
    ).toBe(false);
  });

  it('rejects a pack with no attribution, because seeding must fail without it (NFR-6)', () => {
    expect(RulesetVersion.safeParse({ ...rulesetVersion, attribution: '' }).success).toBe(false);
    expect(RulesetVersion.safeParse({ ...rulesetVersion, license: '' }).success).toBe(false);
  });

  it('requires a semver version, since published versions are immutable (VR-1)', () => {
    expect(RulesetVersion.safeParse({ ...rulesetVersion, version: '5.1' }).success).toBe(false);
    expect(RulesetVersion.safeParse({ ...rulesetVersion, version: '5.1.0' }).success).toBe(true);
  });
});

describe('ResolvedProfile', () => {
  it('accepts a resolved stack with its hash and an empty conflict list', () => {
    const parsed = ResolvedProfile.parse(resolvedProfile);

    expect(parsed.conflicts).toEqual([]);
    expect(parsed.sources[0]?.layer).toBe('dnd5e-srd');
  });

  it('carries conflicts rather than throwing them, so /profiles can show them (FR-12)', () => {
    const conflicted = ResolvedProfile.parse({
      ...resolvedProfile,
      conflicts: [
        {
          kind: 'override-missing',
          ruleKey: 'combat.flanking',
          layer: 'house-flanking',
          detail: 'no rule with that key exists in the base',
        },
      ],
    });

    expect(conflicted.conflicts[0]?.kind).toBe('override-missing');
  });

  it('rejects a profile with no sources', () => {
    expect(ResolvedProfile.safeParse({ ...resolvedProfile, sources: [] }).success).toBe(false);
  });
});
