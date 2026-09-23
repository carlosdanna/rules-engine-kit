/**
 * The blank-slate situation `/scenarios/new` starts from (FR-18).
 *
 * `Situation` is a `strictObject` with no defaults anywhere: all five top-level keys are
 * required, and `items` and `intents` have to be written out as `{}` rather than omitted.
 * That is easy to get wrong by hand and impossible to get wrong twice, so the factory is
 * tested against the schema rather than against a fixture of itself.
 */

import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../../src/schema/primitives';
import { blankSituation, SITUATION_SCHEMA_VERSION, Situation } from '../../src/schema/situation';

describe('blankSituation', () => {
  it('parses as a Situation', () => {
    expect(() => Situation.parse(blankSituation())).not.toThrow();
  });

  it('carries every top-level key, including the two empty ones', () => {
    expect(Object.keys(blankSituation()).sort()).toEqual([
      'actors',
      'intents',
      'items',
      'schemaVersion',
      'timeline',
    ]);
  });

  it('is stamped with the current schema version', () => {
    expect(blankSituation().schemaVersion).toBe(SITUATION_SCHEMA_VERSION);
  });

  /**
   * `z.record(Ability, …)` accepts `{}`, so a missing ability is a schema pass and an
   * unknown-fact throw later (CLAUDE.md: unknown fact paths are errors, not silent nulls).
   * A blank actor answers every ability a rule might read.
   */
  it('gives its actor all six ability scores', () => {
    const [actor] = blankSituation().actors;
    expect(Object.keys(actor?.abilities ?? {}).sort()).toEqual([...ABILITIES].sort());
  });

  it('starts at full health, unconditioned and unarmed', () => {
    const [actor] = blankSituation().actors;
    expect(actor?.hpCurrent).toBe(actor?.hp);
    expect(actor?.conditions).toEqual([]);
    expect(blankSituation().items).toEqual({});
  });

  it('has one step, taking no action, whose actor exists', () => {
    const situation = blankSituation();
    const [step] = situation.timeline;
    expect(situation.timeline).toHaveLength(1);
    expect(step?.action).toBeNull();
    expect(situation.actors.map((actor) => actor.id)).toContain(step?.actorId);
  });

  /** Pure, so two calls agree — and neither shares a reference the caller could mutate. */
  it('returns a fresh, equal value each time', () => {
    const first = blankSituation();
    const second = blankSituation();
    expect(first).toEqual(second);
    expect(first.actors).not.toBe(second.actors);
  });
});
