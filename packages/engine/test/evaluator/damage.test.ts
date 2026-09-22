/**
 * The multiplicative damage channel and the clamp at 0 (ADR-0025, ADR-0023).
 *
 * `resolveDamageScale` is the whole of the SRD's "Resistance and Vulnerability" arithmetic,
 * so the cases below are the sentences of that section, one test each.
 */

import { describe, expect, it } from 'vitest';
import { resolveDamageScale, stepDamageType } from '../../src/evaluator';
import type { DamageScale, Item, Step } from '../../src/schema';

const grants = (...scales: DamageScale[]) => scales.map((scale) => ({ scale }));

describe('resolveDamageScale — SRD "Resistance and Vulnerability"', () => {
  it('leaves an unscaled total alone', () => {
    expect(resolveDamageScale(7, [])).toBe(7);
  });

  it('halves for resistance, rounding down', () => {
    expect(resolveDamageScale(6, grants('resistance'))).toBe(3);
    // 5.2.1 states the rounding inline; 5.1 leaves it to its general round-down rule.
    expect(resolveDamageScale(7, grants('resistance'))).toBe(3);
  });

  it('doubles for vulnerability', () => {
    expect(resolveDamageScale(6, grants('vulnerability'))).toBe(12);
  });

  it('counts multiple instances of one scale as only one', () => {
    // "if you have Resistance to Necrotic damage as well as Resistance to all damage,
    // Necrotic damage is reduced by half against you" — not by three-quarters.
    expect(resolveDamageScale(8, grants('resistance', 'resistance'))).toBe(4);
    expect(resolveDamageScale(8, grants('vulnerability', 'vulnerability'))).toBe(16);
  });

  it('composes resistance then vulnerability, which is not the same as cancelling', () => {
    // Both editions apply resistance second and vulnerability third, so an odd total is
    // observably not returned unchanged. This is why the channel is not roll-mode's
    // cancelling algorithm, however much the two resemble each other.
    expect(resolveDamageScale(9, grants('resistance', 'vulnerability'))).toBe(8);
    expect(resolveDamageScale(9, grants('vulnerability', 'resistance'))).toBe(8);
    expect(resolveDamageScale(10, grants('resistance', 'vulnerability'))).toBe(10);
  });

  it('is unaffected by the order the grants arrived in', () => {
    const a = resolveDamageScale(13, grants('vulnerability', 'resistance', 'resistance'));
    const b = resolveDamageScale(13, grants('resistance', 'resistance', 'vulnerability'));
    expect(a).toBe(b);
    expect(a).toBe(12);
  });
});

describe('stepDamageType', () => {
  const mace: Item = {
    slug: 'mace',
    name: 'Mace',
    damage: { dice: { count: 1, sides: 6 }, type: 'bludgeoning' },
    properties: [],
    mastery: 'sap',
  };
  const attack = (weapon: string | null): Step => ({
    id: 's',
    round: 1,
    actorId: 'guard',
    action: { type: 'attack', mode: 'melee', targetId: 'goblin', weapon, rangeFt: 5 },
  });

  it('takes the type from the weapon the step names', () => {
    expect(stepDamageType(attack('mace'), { mace })).toBe('bludgeoning');
  });

  it('is untyped for an unarmed attack, which has no weapon to ask', () => {
    expect(stepDamageType(attack(null), { mace })).toBe('untyped');
  });

  it('is untyped for a weapon that deals no damage of its own', () => {
    const shield: Item = { ...mace, slug: 'shield', name: 'Shield', damage: null };
    expect(stepDamageType(attack('shield'), { shield })).toBe('untyped');
  });

  it('is untyped for a step that takes no action', () => {
    expect(stepDamageType({ id: 's', round: 1, actorId: 'guard', action: null }, {})).toBe(
      'untyped',
    );
  });
});
