import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  createFactRegistry,
  DuplicateFactError,
  evaluateCondition,
  FactTypeError,
  factTypeSchema,
  lintCondition,
  registryFromFacts,
  UnknownFactError,
} from '../../src/conditions';
import { type Condition, FactType } from '../../src/schema';
import { facts, registry, testSource } from './helpers';

describe('createFactRegistry', () => {
  it('rejects a duplicate path at construction', () => {
    expect(() =>
      createFactRegistry([
        { path: 'actor.name', type: z.string() },
        { path: 'actor.name', type: z.string() },
      ]),
    ).toThrow(DuplicateFactError);
  });

  it('reports the registered paths', () => {
    expect(registry.has('actor.conditions')).toBe(true);
    expect(registry.has('actor.morale')).toBe(false);
    expect(registry.paths()).toContain('action.rangeFt');
  });
});

describe('unknown fact paths are errors, not silent nulls (FR-17)', () => {
  const condition: Condition = {
    all: [
      { '==': [{ var: 'step.action.type' }, 'attack'] },
      { '==': [{ var: 'actor.morale' }, 'steady'] },
    ],
  };

  it('throws UnknownFactError carrying the path and the offending var pointer', () => {
    let thrown: unknown;
    try {
      evaluateCondition(condition, registry, testSource(facts).source);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(UnknownFactError);
    const error = thrown as UnknownFactError;
    expect(error.code).toBe('UNKNOWN_FACT');
    expect(error.path).toBe('actor.morale');
    expect(error.pointer).toBe('/all/1/==/0');
  });

  it('words the run-time error exactly as the lint message for the same path', () => {
    // ADR-0013: lint and evaluation walk the same tree, so an author sees one wording.
    const lint = lintCondition(condition, registry);
    expect(lint.unknownPaths).toEqual([
      {
        path: 'actor.morale',
        pointer: '/all/1/==/0',
        message: expect.any(String),
      },
    ]);

    let message = '';
    try {
      evaluateCondition(condition, registry, testSource(facts).source);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toBe(lint.unknownPaths[0]?.message);
  });

  it('never reaches the source for an unregistered path', () => {
    const { source, reads } = testSource(facts);
    expect(() => evaluateCondition(condition, registry, source)).toThrow(UnknownFactError);
    expect(reads).toEqual(['step.action.type']);
  });
});

describe('a fact value must match its registered type', () => {
  it('throws FactTypeError when the source returns the wrong shape', () => {
    const { source } = testSource({ ...facts, 'action.rangeFt': 'five' });
    let thrown: unknown;
    try {
      evaluateCondition({ '<=': [{ var: 'action.rangeFt' }, 5] }, registry, source);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(FactTypeError);
    const error = thrown as FactTypeError;
    expect(error.code).toBe('FACT_TYPE');
    expect(error.path).toBe('action.rangeFt');
    expect(error.pointer).toBe('/<=/0');
  });

  it('reports the value the registered type produced, not the raw one', () => {
    // The registry is the single definition of what a path means, so evaluation compares
    // against the parsed value and the trace records that same value.
    const { source } = testSource(facts);
    const result = evaluateCondition(
      { in: ['prone', { var: 'actor.conditions' }] },
      registry,
      source,
    );
    expect(result.factsRead).toEqual([{ path: 'actor.conditions', value: ['prone'] }]);
  });
});

describe('registryFromFacts — the authored facts.yaml form', () => {
  it('builds a registry straight from a pack, mapping each FactType to a schema', () => {
    const packRegistry = registryFromFacts([
      { path: 'actor.ac.effective', type: 'number', description: 'AC after cover', derived: true },
      {
        path: 'actor.conditions',
        type: 'stringList',
        description: 'Active conditions',
        derived: false,
      },
    ]);
    expect(packRegistry.paths()).toEqual(['actor.ac.effective', 'actor.conditions']);

    const { source } = testSource({ 'actor.conditions': ['prone'], 'actor.ac.effective': 15 });
    expect(
      evaluateCondition({ in: ['prone', { var: 'actor.conditions' }] }, packRegistry, source).value,
    ).toBe(true);
  });

  it('still rejects a value that does not match the declared type', () => {
    const packRegistry = registryFromFacts([
      { path: 'actor.ac.effective', type: 'number', description: 'AC after cover', derived: true },
    ]);
    const { source } = testSource({ 'actor.ac.effective': '15' });
    expect(() =>
      evaluateCondition({ '>=': [{ var: 'actor.ac.effective' }, 15] }, packRegistry, source),
    ).toThrow(FactTypeError);
  });

  it('maps every FactType the schema allows', () => {
    for (const type of FactType.options) {
      expect(() => factTypeSchema(type)).not.toThrow();
    }
  });
});
