import { describe, expect, it } from 'vitest';
import type { Conflict, ResolvedRule } from '../../src/index';
import { IncompatibleStackError, ResolvedProfile, resolveProfile } from '../../src/index';
import { add, BASE_ID, base, disable, HOUSE_ID, layer, override, rule } from './fixtures';

function byKey(rules: readonly ResolvedRule[], key: string): ResolvedRule {
  const found = rules.find((r) => r.key === key);
  if (!found) throw new Error(`no resolved rule ${key}`);
  return found;
}

function kinds(conflicts: readonly Conflict[]): Conflict['kind'][] {
  return conflicts.map((c) => c.kind);
}

describe('resolveProfile — merge ops (VR-2)', () => {
  it('keeps a base rule untouched when no layer mentions it', () => {
    const profile = resolveProfile([
      base([add('a.one', { priority: 10 })]),
      layer([add('b.two', { priority: 20 })]),
    ]);

    expect(profile.rules.map((r) => r.key)).toEqual(['a.one', 'b.two']);
    expect(byKey(profile.rules, 'a.one').provenance).toEqual([
      { layer: BASE_ID, version: '5.2.1', op: 'add' },
    ]);
    expect(profile.conflicts).toEqual([]);
  });

  it('override replaces the whole body and keeps the rule key', () => {
    const profile = resolveProfile([
      base([add('a.one', { label: 'Base label', phase: 'declare', effects: [] })]),
      layer([
        override('a.one', {
          label: 'Layered label',
          phase: 'compare',
          condition: { '==': [{ var: 'actor.surprised' }, true] },
        }),
      ]),
    ]);

    const resolved = byKey(profile.rules, 'a.one');
    expect(resolved.key).toBe('a.one');
    expect(resolved.label).toBe('Layered label');
    expect(resolved.phase).toBe('compare');
    expect(resolved.condition).toEqual({ '==': [{ var: 'actor.surprised' }, true] });
    expect(profile.conflicts).toEqual([]);
  });

  it('patch changes only the whitelisted fields it names, leaving the rest of the body', () => {
    const profile = resolveProfile([
      base([
        add('a.one', {
          priority: 100,
          label: 'Base label',
          tags: ['base'],
          condition: { '==': [{ var: 'actor.prone' }, true] },
        }),
      ]),
      layer([{ op: 'patch', key: 'a.one', priority: 10, tags: ['base', 'house'] }]),
    ]);

    const resolved = byKey(profile.rules, 'a.one');
    expect(resolved.priority).toBe(10);
    expect(resolved.tags).toEqual(['base', 'house']);
    expect(resolved.label).toBe('Base label');
    expect(resolved.condition).toEqual({ '==': [{ var: 'actor.prone' }, true] });
    expect(profile.conflicts).toEqual([]);
  });

  it('patch can set interpretation back to null', () => {
    const profile = resolveProfile([
      base([add('a.one', { interpretation: 'The SRD wording is ambiguous.' })]),
      layer([{ op: 'patch', key: 'a.one', interpretation: null }]),
    ]);

    expect(byKey(profile.rules, 'a.one').interpretation).toBeNull();
  });

  it('disable keeps the rule in the list, flagged, so "why not" can name the layer (VR-4)', () => {
    const profile = resolveProfile([
      base([add('a.one'), add('b.two')]),
      layer([disable('a.one', 'Replaced by a house ruling.')]),
    ]);

    expect(profile.rules.map((r) => r.key)).toEqual(['a.one', 'b.two']);
    expect(byKey(profile.rules, 'a.one').enabled).toBe(false);
    expect(byKey(profile.rules, 'b.two').enabled).toBe(true);
    expect(byKey(profile.rules, 'a.one').provenance).toEqual([
      { layer: BASE_ID, version: '5.2.1', op: 'add' },
      { layer: HOUSE_ID, version: '1.0.0', op: 'disable' },
    ]);
    expect(profile.conflicts).toEqual([]);
  });

  it('a later override re-enables a disabled rule, because it supplies a fresh body', () => {
    const profile = resolveProfile([
      base([add('a.one')]),
      layer([disable('a.one')], { id: 'off', version: '1.0.0' }),
      layer([override('a.one', { label: 'Back on' })], { id: 'on', version: '1.0.0' }),
    ]);

    const resolved = byKey(profile.rules, 'a.one');
    expect(resolved.enabled).toBe(true);
    expect(resolved.label).toBe('Back on');
    expect(resolved.provenance.map((p) => p.op)).toEqual(['add', 'disable', 'override']);
  });
});

describe('resolveProfile — conflicts are reported, not silently resolved (FR-12)', () => {
  it('reports a second add of the same key and records both ops in provenance', () => {
    const profile = resolveProfile([
      base([add('a.one', { label: 'First' })]),
      layer([add('a.one', { label: 'Second' })]),
    ]);

    expect(kinds(profile.conflicts)).toEqual(['duplicate-add']);
    expect(profile.conflicts[0]).toMatchObject({ ruleKey: 'a.one', layer: HOUSE_ID });
    // Last still wins (VR-4), but the author is told to say `override` if that was meant.
    expect(byKey(profile.rules, 'a.one').label).toBe('Second');
    expect(byKey(profile.rules, 'a.one').provenance.map((p) => p.op)).toEqual(['add', 'add']);
  });

  it('reports two adds of the same key inside one ruleset version', () => {
    const profile = resolveProfile([base([add('a.one'), add('a.one', { label: 'Again' })])]);

    expect(kinds(profile.conflicts)).toEqual(['duplicate-add']);
    expect(byKey(profile.rules, 'a.one').label).toBe('Again');
  });

  it('reports an override of a missing key and adds nothing', () => {
    const profile = resolveProfile([base([add('a.one')]), layer([override('nope.missing')])]);

    expect(kinds(profile.conflicts)).toEqual(['override-missing']);
    expect(profile.conflicts[0]).toMatchObject({ ruleKey: 'nope.missing', layer: HOUSE_ID });
    expect(profile.rules.map((r) => r.key)).toEqual(['a.one']);
  });

  it('reports a patch of a missing key and adds nothing', () => {
    const profile = resolveProfile([
      base([add('a.one')]),
      layer([{ op: 'patch', key: 'nope.missing', priority: 5 }]),
    ]);

    expect(kinds(profile.conflicts)).toEqual(['patch-missing']);
    expect(profile.rules.map((r) => r.key)).toEqual(['a.one']);
  });

  it('reports a disable of a missing key and adds nothing', () => {
    const profile = resolveProfile([base([add('a.one')]), layer([disable('nope.missing')])]);

    expect(kinds(profile.conflicts)).toEqual(['disable-missing']);
    expect(profile.rules.map((r) => r.key)).toEqual(['a.one']);
  });

  it('rejects a patch that reaches a semantic field, applying none of it (ADR-0009)', () => {
    const forbidden = {
      op: 'patch',
      key: 'a.one',
      priority: 5,
      condition: { '==': [{ var: 'actor.prone' }, true] },
    } as unknown as Parameters<typeof layer>[0][number];

    const profile = resolveProfile([
      base([add('a.one', { priority: 100, condition: null })]),
      layer([forbidden]),
    ]);

    expect(kinds(profile.conflicts)).toEqual(['patch-forbidden-field']);
    expect(profile.conflicts[0]?.detail).toContain('condition');
    // The whole entry is skipped: half a patch is a rule body nobody wrote.
    expect(byKey(profile.rules, 'a.one').priority).toBe(100);
    expect(byKey(profile.rules, 'a.one').condition).toBeNull();
  });

  it('reports enabled rules that share a phase and priority, since order falls back to key', () => {
    const profile = resolveProfile([
      base([
        add('b.two', { phase: 'roll', priority: 50 }),
        add('a.one', { phase: 'roll', priority: 50 }),
        add('c.three', { phase: 'roll', priority: 60 }),
      ]),
    ]);

    expect(kinds(profile.conflicts)).toEqual(['priority-tie']);
    expect(profile.conflicts[0]?.detail).toContain('a.one');
    expect(profile.conflicts[0]?.detail).toContain('b.two');
  });

  it('does not report a priority tie between a disabled rule and an enabled one', () => {
    const profile = resolveProfile([
      base([add('a.one', { priority: 50 }), add('b.two', { priority: 50 })]),
      layer([disable('b.two')]),
    ]);

    expect(profile.conflicts).toEqual([]);
  });
});

describe('resolveProfile — provenance and ordering (VR-4, FR-9)', () => {
  it('records every op that touched a key, base first, last wins', () => {
    const profile = resolveProfile([
      base([add('a.one')]),
      layer([{ op: 'patch', key: 'a.one', priority: 10 }], { id: 'l1', version: '1.0.0' }),
      layer([override('a.one', { priority: 20 })], { id: 'l2', version: '2.3.4' }),
    ]);

    expect(byKey(profile.rules, 'a.one').provenance).toEqual([
      { layer: BASE_ID, version: '5.2.1', op: 'add' },
      { layer: 'l1', version: '1.0.0', op: 'patch' },
      { layer: 'l2', version: '2.3.4', op: 'override' },
    ]);
  });

  it('records no provenance for an op that changed nothing', () => {
    const profile = resolveProfile([
      base([add('a.one')]),
      layer([{ op: 'patch', key: 'somewhere.else', priority: 10 }]),
    ]);

    expect(byKey(profile.rules, 'a.one').provenance).toHaveLength(1);
  });

  it('orders rules by phase, then priority, then key', () => {
    const profile = resolveProfile([
      base([
        add('z.late', { phase: 'expire', priority: 1 }),
        add('b.mid', { phase: 'modifiers', priority: 50 }),
        add('a.mid', { phase: 'modifiers', priority: 50 }),
        add('c.early', { phase: 'modifiers', priority: 10 }),
        add('d.upkeep', { phase: 'upkeep', priority: 999 }),
      ]),
    ]);

    expect(profile.rules.map((r) => r.key)).toEqual([
      'd.upkeep',
      'c.early',
      'a.mid',
      'b.mid',
      'z.late',
    ]);
  });

  it('orders disabled rules alongside the rest, since the list is a superset', () => {
    const profile = resolveProfile([
      base([add('a.one', { priority: 10 }), add('b.two', { priority: 20 })]),
      layer([disable('a.one')]),
    ]);

    expect(profile.rules.map((r) => r.key)).toEqual(['a.one', 'b.two']);
  });

  it('reports the layer identities in declared order, base first', () => {
    const profile = resolveProfile([
      base([add('a.one')]),
      layer([], { id: 'l1', version: '1.0.0' }),
      layer([], { id: 'l2', version: '2.0.0' }),
    ]);

    expect(profile.sources).toEqual([
      { layer: BASE_ID, version: '5.2.1' },
      { layer: 'l1', version: '1.0.0' },
      { layer: 'l2', version: '2.0.0' },
    ]);
  });

  it('returns a profile that satisfies the ResolvedProfile schema', () => {
    const profile = resolveProfile([base([add('a.one')]), layer([disable('a.one')])]);

    expect(ResolvedProfile.safeParse(profile).success).toBe(true);
  });
});

describe('resolveProfile — compatibility (VR-3)', () => {
  it('accepts a layer whose range covers the base version', () => {
    expect(() =>
      resolveProfile([
        base([add('a.one')]),
        layer([], { extends: { id: BASE_ID, range: '^5.2.0' } }),
      ]),
    ).not.toThrow();
  });

  it('throws a typed error when the base version is outside the layer range', () => {
    const stack = [
      base([add('a.one')], { version: '5.1.0' }),
      layer([], { extends: { id: BASE_ID, range: '^5.2.0' } }),
    ];

    expect(() => resolveProfile(stack)).toThrow(IncompatibleStackError);
    try {
      resolveProfile(stack);
      expect.unreachable('expected an IncompatibleStackError');
    } catch (error) {
      expect(error).toBeInstanceOf(IncompatibleStackError);
      const incompatible = error as IncompatibleStackError;
      expect(incompatible.reason.kind).toBe('range-unsatisfied');
      expect(incompatible.message).toContain('^5.2.0');
      expect(incompatible.message).toContain('5.1.0');
    }
  });

  it('throws when a layer extends a ruleset that is not the base of the stack', () => {
    const stack = [base([]), layer([], { extends: { id: 'some-other-pack', range: '^1.0.0' } })];

    expect(() => resolveProfile(stack)).toThrow(IncompatibleStackError);
    expect(() => resolveProfile(stack)).toThrow(/some-other-pack/);
  });

  it('throws when the range cannot be parsed', () => {
    const stack = [base([]), layer([], { extends: { id: BASE_ID, range: 'newest-ish' } })];

    expect(() => resolveProfile(stack)).toThrow(IncompatibleStackError);
  });

  it('throws when the stack is empty', () => {
    expect(() => resolveProfile([])).toThrow(IncompatibleStackError);
  });

  it('throws when position 0 is not a base', () => {
    expect(() => resolveProfile([layer([])])).toThrow(IncompatibleStackError);
  });

  it('throws when a second base appears in the stack', () => {
    expect(() => resolveProfile([base([]), base([], { id: 'other-base' })])).toThrow(
      IncompatibleStackError,
    );
  });

  it('throws when the same ruleset appears twice', () => {
    expect(() => resolveProfile([base([]), layer([]), layer([])])).toThrow(IncompatibleStackError);
  });
});

describe('resolveProfile — hash (VR-7, ADR-0009)', () => {
  it('is a sha256 digest of the canonical rule list', () => {
    const profile = resolveProfile([base([add('a.one')])]);

    expect(profile.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('is stable regardless of the key order of the input objects', () => {
    const shuffled = {
      rules: [
        {
          interpretation: null,
          citation: { section: 'Rules Glossary', source: 'srd-5.2.1' },
          effects: [],
          condition: null,
          tags: ['b', 'a'],
          description: 'Body of a.one.',
          label: 'a.one',
          priority: 100,
          phase: 'modifiers',
          key: 'a.one',
          op: 'add',
        },
      ],
      facts: [],
      attribution: 'This work includes material from the System Reference Document 5.2.1.',
      sourceUrl: 'https://www.dndbeyond.com/srd',
      license: 'CC-BY-4.0',
      extends: null,
      kind: 'base',
      name: 'SRD 5.2.1',
      version: '5.2.1',
      id: BASE_ID,
    } as unknown as Parameters<typeof resolveProfile>[0][number];

    const ordered = resolveProfile([base([add('a.one', { tags: ['b', 'a'] })])]);

    expect(resolveProfile([shuffled]).hash).toBe(ordered.hash);
  });

  it('changes when a patch changes a priority, because ordering is part of the result', () => {
    const plain = resolveProfile([base([add('a.one', { priority: 100 })])]);
    const patched = resolveProfile([
      base([add('a.one', { priority: 100 })]),
      layer([{ op: 'patch', key: 'a.one', priority: 10 }]),
    ]);

    expect(patched.hash).not.toBe(plain.hash);
  });

  it('changes when a rule is disabled, even though the rule stays in the list', () => {
    const enabled = resolveProfile([base([add('a.one')]), layer([])]);
    const disabled = resolveProfile([base([add('a.one')]), layer([disable('a.one')])]);

    expect(disabled.hash).not.toBe(enabled.hash);
  });

  it('changes with the layer identities, not only with the rules', () => {
    const rules = [add('a.one')];
    const one = resolveProfile([base(rules)]);
    const two = resolveProfile([base(rules), layer([], { id: 'inert' })]);

    expect(two.hash).not.toBe(one.hash);
  });

  it('distinguishes two stacks that differ only in layer order', () => {
    const first = resolveProfile([
      base([add('a.one')]),
      layer([{ op: 'patch', key: 'a.one', label: 'From l1' }], { id: 'l1' }),
      layer([{ op: 'patch', key: 'a.one', label: 'From l2' }], { id: 'l2' }),
    ]);
    const second = resolveProfile([
      base([add('a.one')]),
      layer([{ op: 'patch', key: 'a.one', label: 'From l2' }], { id: 'l2' }),
      layer([{ op: 'patch', key: 'a.one', label: 'From l1' }], { id: 'l1' }),
    ]);

    expect(second.hash).not.toBe(first.hash);
  });
});

describe('resolveProfile — purity (NFR-1, FR-3)', () => {
  it('never mutates the packs it was given', () => {
    const packs = [base([add('a.one', { priority: 100 })]), layer([disable('a.one')])];
    const before = structuredClone(packs);

    resolveProfile(packs);

    expect(packs).toEqual(before);
  });

  it('returns the same hash for the same input, twice', () => {
    const packs = [base([add('a.one'), add('b.two')]), layer([override('a.one')])];

    expect(resolveProfile(packs).hash).toBe(resolveProfile(packs).hash);
  });
});

describe('rule fixture', () => {
  it('builds a body the Rule schema accepts', () => {
    expect(rule('a.one').key).toBe('a.one');
  });
});
