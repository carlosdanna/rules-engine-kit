/**
 * The world state the phase loop threads through a run (ADR-0002, FR-3).
 *
 * A mutable holder of immutable values: the store object is replaced field by field, but
 * every actor record and every array it hands out is fresh, so a snapshot taken earlier
 * stays valid. Actors are cloned at construction, so the caller's `Situation` is never
 * aliased — the same discipline `resolver/resolveProfile.ts` uses for rule bodies.
 */

import type { FactRegistry } from '../conditions';
import type {
  ActiveEffect,
  Actor,
  ActorState,
  DerivedValue,
  Json,
  StateDelta,
  WorldState,
} from '../schema';
import { EffectApplicationError, UnknownActorError } from './errors';
import { parseWritablePath } from './paths';

export type ActorRecord = Readonly<Actor>;

export type WorldStateStore = {
  actor(id: string): ActorRecord;
  has(id: string): boolean;
  actorIds(): readonly string[];
  /** Printed conditions plus those granted by live effects — what a rule means by "prone". */
  conditionsOf(id: string): readonly string[];

  read(path: string): Json;
  write(path: string, value: Json, ruleKey: string): StateDelta;
  beginStep(): void;

  activeEffects(): readonly ActiveEffect[];
  addEffect(effect: ActiveEffect): void;
  removeEffects(predicate: (effect: ActiveEffect) => boolean): ActiveEffect[];

  sealDerived(value: DerivedValue): void;
  derivedValue(path: string, actorId: string): DerivedValue | undefined;
  derivedValues(): readonly DerivedValue[];

  snapshot(): WorldState;
};

function derivedKey(path: string, actorId: string): string {
  return `${path}\u0000${actorId}`;
}

export function createWorldStateStore(args: {
  actors: readonly Actor[];
  registry: FactRegistry;
}): WorldStateStore {
  let actors = new Map<string, ActorRecord>(
    args.actors.map((actor) => [actor.id, structuredClone(actor) as ActorRecord]),
  );
  let effects: ActiveEffect[] = [];
  let scratch = new Map<string, Json>();
  const world = new Map<string, Json>();
  const derived = new Map<string, DerivedValue>();

  function requireActor(id: string): ActorRecord {
    const actor = actors.get(id);
    if (actor === undefined) throw new UnknownActorError(id);
    return actor;
  }

  function conditionsOf(id: string): readonly string[] {
    const granted = effects
      .filter((effect) => effect.actorId === id)
      .map((effect) => effect.condition);
    // A condition both printed and granted is still one condition.
    return [...new Set([...requireActor(id).conditions, ...granted])];
  }

  function readWritable(path: string): Json {
    const parsed = parseWritablePath(path);
    if (parsed === null) return null;
    if (parsed.kind === 'scratch') return scratch.get(path) ?? null;
    if (parsed.kind === 'world') return world.get(path) ?? null;
    const actor = requireActor(parsed.actorId);
    return parsed.field === 'hpCurrent' ? actor.hpCurrent : [...conditionsOf(parsed.actorId)];
  }

  return {
    actor: requireActor,
    has: (id) => actors.has(id),
    actorIds: () => [...actors.keys()],
    conditionsOf,
    read: readWritable,

    write(path, value, ruleKey) {
      const parsed = parseWritablePath(path);
      if (parsed === null) {
        throw new EffectApplicationError({ kind: 'unwritable-path', path }, ruleKey, 'setValue');
      }
      // Symmetry with FR-17: you cannot write a path a condition could never legally read.
      if (!args.registry.has(path)) {
        throw new EffectApplicationError({ kind: 'unregistered-write', path }, ruleKey, 'setValue');
      }

      const from = readWritable(path);

      if (parsed.kind === 'scratch') {
        scratch = new Map(scratch).set(path, value);
      } else if (parsed.kind === 'world') {
        world.set(path, value);
      } else {
        const actor = requireActor(parsed.actorId);
        const next =
          parsed.field === 'hpCurrent'
            ? { ...actor, hpCurrent: Number(value) }
            : { ...actor, conditions: (value as string[]).map(String) };
        // Replace the map as well as the record, so a snapshot taken before this call does
        // not see the change through a shared reference.
        actors = new Map(actors).set(parsed.actorId, next);
      }

      return { path, from, to: value };
    },

    beginStep() {
      scratch = new Map();
    },

    activeEffects: () => effects,
    addEffect(effect) {
      effects = [...effects, effect];
    },
    removeEffects(predicate) {
      const removed = effects.filter(predicate);
      if (removed.length > 0) {
        effects = effects.filter((effect) => !predicate(effect));
      }
      return removed;
    },

    sealDerived(value) {
      derived.set(derivedKey(value.path, value.actorId), value);
    },
    derivedValue: (path, actorId) => derived.get(derivedKey(path, actorId)),
    derivedValues: () => [...derived.values()],

    snapshot(): WorldState {
      const projected: Record<string, ActorState> = {};
      for (const id of actors.keys()) {
        projected[id] = {
          id,
          hpCurrent: requireActor(id).hpCurrent,
          conditions: [...conditionsOf(id)],
        };
      }
      // `beyondTimeline` effects survive into the final state on purpose: outliving the run
      // is a real answer, distinct from having expired (ADR-0012).
      return { actors: projected, activeEffects: [...effects] };
    },
  };
}
