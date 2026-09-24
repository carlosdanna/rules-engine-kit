import { describe, expect, it } from 'vitest';
import { diffRulesets } from '../../src/diff';
import type { Condition } from '../../src/schema';
import { add, base, disable, override } from '../resolver/fixtures';

describe('diffRulesets (VR-9)', () => {
  it('names the two versions it compared', () => {
    const diff = diffRulesets(base([]), base([], { version: '5.1.0' }));
    expect(diff.a).toEqual({ id: 'dnd5e-srd', version: '5.2.1' });
    expect(diff.b).toEqual({ id: 'dnd5e-srd', version: '5.1.0' });
  });

  it('splits entries by rule_key into added, removed, changed and unchanged', () => {
    const a = base([add('a.kept'), add('b.gone'), add('c.moved', { phase: 'declare' })]);
    const b = base([add('a.kept'), add('c.moved', { phase: 'modifiers' }), add('d.new')]);

    const diff = diffRulesets(a, b);
    expect(diff.added.map((entry) => entry.key)).toEqual(['d.new']);
    expect(diff.removed.map((entry) => entry.key)).toEqual(['b.gone']);
    expect(diff.unchanged).toBe(1);
    expect(diff.changed).toHaveLength(1);
    expect(diff.changed[0]?.key).toBe('c.moved');
    expect(diff.changed[0]?.fields).toEqual([{ field: 'phase', a: 'declare', b: 'modifiers' }]);
  });

  it('compares conditions and effects as JSON, not by reference', () => {
    const condition: Condition = { '==': [{ var: 'actor.surprised' }, true] };
    const a = base([add('a.one', { condition })]);
    const b = base([add('a.one', { condition: structuredClone(condition) })]);

    expect(diffRulesets(a, b).changed).toEqual([]);
  });

  it('reports a change of op, and a field only one entry has, as null on the other side', () => {
    const a = base([add('a.one')]);
    const b = base([disable('a.one', 'not in this edition')]);

    const fields = diffRulesets(a, b).changed[0]?.fields.map((field) => field.field);
    expect(fields).toContain('op');
    expect(fields).toContain('reason');
    expect(diffRulesets(a, b).changed[0]?.fields.find((f) => f.field === 'reason')).toEqual({
      field: 'reason',
      a: null,
      b: 'not in this edition',
    });
  });

  it('orders every list by rule_key', () => {
    const diff = diffRulesets(base([]), base([override('z.last'), add('a.first')]));
    expect(diff.added.map((entry) => entry.key)).toEqual(['a.first', 'z.last']);
  });
});
