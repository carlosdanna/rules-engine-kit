import { describe, expect, it } from 'vitest';
import { resolveStack } from '../../src/stacking';
import { modifier } from './helpers';

describe('resolveStack — sum (FR-11)', () => {
  it('adds every contribution of a type: +3 ability and +2 proficiency = +5', () => {
    const { applied, dropped, total } = resolveStack([
      modifier('stat.ability-mod', 'ability', 3, 'sum'),
      modifier('stat.proficiency', 'proficiency', 2, 'sum'),
    ]);
    expect(total).toBe(5);
    expect(applied.map((m) => m.value)).toEqual([3, 2]);
    expect(dropped).toEqual([]);
  });

  it('keeps types apart: two sums of different types never interfere', () => {
    const { total } = resolveStack([
      modifier('a', 'cover', 2, 'sum'),
      modifier('b', 'ability', 3, 'sum'),
      modifier('c', 'cover', 1, 'sum'),
    ]);
    expect(total).toBe(6);
  });
});

describe('resolveStack — highest (FR-11)', () => {
  it('keeps +5 half cover over +2 and drops the loser naming the winner', () => {
    const { applied, dropped, total } = resolveStack([
      modifier('cover.half', 'cover', 2, 'highest'),
      modifier('cover.three-quarters', 'cover', 5, 'highest'),
    ]);
    expect(total).toBe(5);
    expect(applied.map((m) => m.ruleKey)).toEqual(['cover.three-quarters']);
    expect(dropped).toHaveLength(1);
    expect(dropped[0]).toMatchObject({ policy: 'highest', beatenBy: 'cover.three-quarters' });
    expect(dropped[0]?.modifier.ruleKey).toBe('cover.half');
  });

  it('keeps the earlier of two equal values, so the winner is a function of the list', () => {
    const { applied } = resolveStack([
      modifier('cover.a', 'cover', 2, 'highest'),
      modifier('cover.b', 'cover', 2, 'highest'),
    ]);
    expect(applied.map((m) => m.ruleKey)).toEqual(['cover.a']);
  });
});

describe('resolveStack — unique (FR-11)', () => {
  it('keeps the first of two modifiers sharing a stackKey: +3 bless, not +6', () => {
    const { applied, dropped, total } = resolveStack([
      modifier('spell.bless', 'bless', 3, 'unique', 'bless'),
      modifier('spell.bless.second-cast', 'bless', 3, 'unique', 'bless'),
    ]);
    expect(total).toBe(3);
    expect(applied.map((m) => m.ruleKey)).toEqual(['spell.bless']);
    expect(dropped[0]).toMatchObject({ policy: 'unique', beatenBy: 'spell.bless' });
  });

  it('lets two different stackKeys of one type both apply', () => {
    const { total, applied } = resolveStack([
      modifier('a', 'blessing', 3, 'unique', 'bless'),
      modifier('b', 'blessing', 2, 'unique', 'guidance'),
    ]);
    expect(total).toBe(5);
    expect(applied).toHaveLength(2);
  });

  it('falls back to the modifier type when no stackKey is declared', () => {
    // Falling back to the rule key would make every rule unique and turn `unique` into `sum`.
    const { total, applied } = resolveStack([
      modifier('stat.proficiency', 'proficiency', 2, 'unique'),
      modifier('feat.expertise', 'proficiency', 4, 'unique'),
    ]);
    expect(total).toBe(2);
    expect(applied.map((m) => m.ruleKey)).toEqual(['stat.proficiency']);
  });
});

describe('resolveStack — a group whose members disagree on policy (FR-11)', () => {
  it('does not let a sum sibling escape a highest constraint', () => {
    // Were the policy read per modifier, the `sum` entry would be added on top of the
    // `highest` winner and a layer could re-enable stacking the base forbade.
    const { applied, total } = resolveStack([
      modifier('cover.half', 'cover', 2, 'highest'),
      modifier('house.extra-cover', 'cover', 1, 'sum'),
    ]);
    expect(total).toBe(2);
    expect(applied.map((m) => m.ruleKey)).toEqual(['cover.half']);
  });

  it('keeps the highest constraint after the rule that declared it loses the dedupe', () => {
    // Found by the property test. `highest` is a statement about the type, so it still binds
    // when its own modifier was deduped away — otherwise dropping a rule would loosen the
    // policy for every sibling that remains.
    const { applied, total } = resolveStack([
      modifier('a', 'cover', 2, 'unique', 'k'),
      modifier('b', 'cover', 9, 'highest', 'k'),
      modifier('c', 'cover', 1, 'sum'),
    ]);
    expect(total).toBe(2);
    expect(applied.map((m) => m.ruleKey)).toEqual(['a']);
  });

  it('runs unique before highest, so dedupe happens on the full group', () => {
    const { applied, dropped, total } = resolveStack([
      modifier('a', 'cover', 2, 'unique', 'k'),
      modifier('b', 'cover', 9, 'unique', 'k'),
      modifier('c', 'cover', 5, 'highest', 'other'),
    ]);
    // `b` is deduped against `a` first, so the 9 never reaches the highest stage.
    expect(total).toBe(5);
    expect(applied.map((m) => m.ruleKey)).toEqual(['c']);
    expect(dropped.map((d) => [d.modifier.ruleKey, d.policy])).toEqual([
      ['b', 'unique'],
      ['a', 'highest'],
    ]);
  });
});

describe('resolveStack — records report content honestly (ADR-0014)', () => {
  it('keeps the declared policy on the modifier and the deciding stage on the drop', () => {
    const { dropped } = resolveStack([
      modifier('cover.half', 'cover', 5, 'highest'),
      modifier('house.extra', 'cover', 1, 'sum'),
    ]);
    expect(dropped[0]?.modifier.policy).toBe('sum');
    expect(dropped[0]?.policy).toBe('highest');
  });

  it('omits stackKey entirely rather than setting it undefined', () => {
    const { applied } = resolveStack([modifier('a', 'cover', 1, 'sum')]);
    expect(applied[0] !== undefined && 'stackKey' in applied[0]).toBe(false);
  });

  it('returns nothing at all for an empty list', () => {
    expect(resolveStack([])).toEqual({ applied: [], dropped: [], total: 0 });
  });
});
