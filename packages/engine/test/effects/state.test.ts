import { describe, expect, it } from 'vitest';
import { createWorldStateStore, EffectApplicationError } from '../../src/effects';
import { actor, registry } from './fakeContext';

const store = () =>
  createWorldStateStore({ actors: [actor('fighter'), actor('goblin')], registry });

describe('createWorldStateStore — immutability (ADR-0002, FR-3)', () => {
  it('does not alias the actors it was given', () => {
    const source = actor('fighter');
    const world = createWorldStateStore({ actors: [source], registry });
    world.write('actor.fighter.hpCurrent', 12, 'test.rule');
    expect(source.hpCurrent).toBe(30);
  });

  it('leaves a snapshot taken before a write unchanged', () => {
    const world = store();
    const before = world.snapshot();
    world.write('actor.fighter.hpCurrent', 12, 'test.rule');
    expect(before.actors.fighter?.hpCurrent).toBe(30);
    expect(world.snapshot().actors.fighter?.hpCurrent).toBe(12);
  });
});

describe('createWorldStateStore — deltas (FR-14)', () => {
  it('reports what the value was and what it became', () => {
    expect(store().write('actor.fighter.hpCurrent', 12, 'test.rule')).toEqual({
      path: 'actor.fighter.hpCurrent',
      from: 30,
      to: 12,
    });
  });

  it('reports null as the previous value of an unset scratch path', () => {
    expect(store().write('scratch.damage.total', 7, 'test.rule')).toEqual({
      path: 'scratch.damage.total',
      from: null,
      to: 7,
    });
  });
});

describe('createWorldStateStore — writable paths', () => {
  it('refuses a path no effect may write', () => {
    expect(() => store().write('actor.fighter.ac', 20, 'test.rule')).toThrow(
      EffectApplicationError,
    );
  });

  it('refuses a registered-looking path that the pack never registered', () => {
    // Symmetry with FR-17: a path a condition could not read must not be writable.
    expect(() => store().write('scratch.unregistered', 1, 'test.rule')).toThrow(
      /unregistered path/,
    );
  });

  it('clears scratch between steps but keeps world flags', () => {
    const world = store();
    world.write('scratch.damage.total', 7, 'test.rule');
    world.write('world.flag', true, 'test.rule');
    world.beginStep();
    expect(world.read('scratch.damage.total')).toBeNull();
    expect(world.read('world.flag')).toBe(true);
  });
});

describe('createWorldStateStore — conditions and active effects', () => {
  const blessed = {
    id: 'eff-1',
    sourceRuleKey: 'spell.bless',
    actorId: 'fighter',
    condition: 'blessed',
    duration: { kind: 'permanent' } as const,
    appliedAt: { round: 1, stepIndex: 0, edge: 'start' as const },
    expiresAt: { kind: 'permanent' } as const,
  };

  it('reads printed conditions together with those an effect granted', () => {
    const world = createWorldStateStore({
      actors: [actor('fighter', { conditions: ['prone'] })],
      registry,
    });
    world.addEffect(blessed);
    expect(world.conditionsOf('fighter')).toEqual(['prone', 'blessed']);
  });

  it('does not list a condition twice when it is both printed and granted', () => {
    const world = createWorldStateStore({
      actors: [actor('fighter', { conditions: ['blessed'] })],
      registry,
    });
    world.addEffect(blessed);
    expect(world.conditionsOf('fighter')).toEqual(['blessed']);
  });

  it('returns what it removed so the caller can trace every removal', () => {
    const world = store();
    world.addEffect(blessed);
    expect(world.removeEffects((e) => e.condition === 'blessed').map((e) => e.id)).toEqual([
      'eff-1',
    ]);
    expect(world.activeEffects()).toEqual([]);
  });

  it('keeps a beyondTimeline effect in the final state (ADR-0012)', () => {
    const world = store();
    world.addEffect({ ...blessed, expiresAt: { kind: 'beyondTimeline', wouldExpireInRound: 21 } });
    expect(world.snapshot().activeEffects).toHaveLength(1);
  });
});
