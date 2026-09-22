import { describe, expect, it } from 'vitest';
import { applyEffects, EFFECT_HANDLERS } from '../../src/effects';
import { EFFECT_TYPES } from '../../src/schema';
import { fakeContext } from './fakeContext';

describe('EFFECT_HANDLERS — a handler for every effect type (FR-7)', () => {
  it('covers the catalogue exactly, with nothing extra', () => {
    expect(Object.keys(EFFECT_HANDLERS).sort()).toEqual([...EFFECT_TYPES].sort());
  });
});

describe('applyEffects — ordering and halt', () => {
  it('applies a rule’s effects in order and concatenates what they produced', () => {
    const ctx = fakeContext();
    const application = applyEffects(
      [
        { type: 'emitEvent', event: 'first' },
        { type: 'emitEvent', event: 'second' },
      ],
      ctx,
    );
    expect(application.emitted.map((e) => e.event)).toEqual(['first', 'second']);
  });

  it('stops at the first halt, so the rest of the rule’s own effects do not run', () => {
    const ctx = fakeContext();
    const application = applyEffects(
      [
        { type: 'emitEvent', event: 'before' },
        { type: 'halt', reason: 'surprised' },
        { type: 'emitEvent', event: 'after' },
      ],
      ctx,
    );
    expect(application.halt).toEqual({ ruleKey: 'test.rule', reason: 'surprised' });
    expect(application.emitted.map((e) => e.event)).toEqual(['before']);
  });
});
