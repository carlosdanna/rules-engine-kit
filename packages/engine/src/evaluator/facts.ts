/**
 * The `FactSource` the phase loop hands to `evaluateCondition` (ADR-0013).
 *
 * `read` is only ever called for a path the registry already accepted — `readOperand`
 * checks registration first — so anything this cannot resolve is an engine gap, not a
 * content error, and says so.
 *
 * Ability modifiers are arithmetic here rather than rules, per ADR-0006: fixtures hold
 * printed values and `(score - 10) / 2` is not a rule anyone would want to cite.
 */

import type { FactSource } from '../conditions';
import type { WorldStateStore } from '../effects';
import type { Intents, Json, Phase, Step } from '../schema';
import { primaryTargetId } from './actorRef';
import { FactResolutionError } from './errors';

const ABILITY = /^actor\.([^.]+)\.abilities\.([^.]+)$/;
const ABILITY_MOD = /^actor\.([^.]+)\.abilityMod\.([^.]+)$/;
const ACTOR_FIELD = /^actor\.([^.]+)\.(name|ac|hp|hpCurrent|proficiencyBonus|conditions)$/;

export type FactSourceArgs = {
  store: WorldStateStore;
  step: Step;
  stepIndex: number;
  intents: Intents;
  /** Read when a derived value is asked for too early, so the error can name the phase. */
  currentPhase(): Phase;
  derivedSealed(): boolean;
};

function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function createFactSource(args: FactSourceArgs): FactSource {
  const { store, step, stepIndex, intents } = args;

  function readActorScoped(path: string): Json {
    const ability = ABILITY.exec(path);
    if (ability !== null) {
      const [, actorId, key] = ability;
      const score = store.actor(actorId as string).abilities[key as 'str'];
      return score ?? null;
    }

    const abilityMod = ABILITY_MOD.exec(path);
    if (abilityMod !== null) {
      const [, actorId, key] = abilityMod;
      const score = store.actor(actorId as string).abilities[key as 'str'];
      return score === undefined ? null : abilityModifier(score);
    }

    const field = ACTOR_FIELD.exec(path);
    if (field !== null) {
      const [, actorId, name] = field;
      const actor = store.actor(actorId as string);
      switch (name) {
        case 'name':
          return actor.name;
        case 'ac':
          return actor.ac;
        case 'hp':
          return actor.hp;
        case 'hpCurrent':
          return actor.hpCurrent;
        case 'proficiencyBonus':
          return actor.proficiencyBonus;
        default:
          // Printed conditions plus anything an effect granted.
          return [...store.conditionsOf(actorId as string)];
      }
    }

    // Anything else under `actor.<id>.` is a derived path assembled by the `modifiers`
    // phase. Reading it before the seal would be forward chaining, so it is an error rather
    // than a partial total (priority-dependent) or the base (silently wrong).
    const derivedActor = /^actor\.([^.]+)\.(.+)$/.exec(path);
    if (derivedActor !== null) {
      const [, actorId, rest] = derivedActor;
      if (!args.derivedSealed()) {
        throw new FactResolutionError({
          kind: 'derived-not-sealed',
          path,
          phase: args.currentPhase(),
        });
      }
      return store.derivedValue(`actor.${rest}`, actorId as string)?.total ?? null;
    }

    throw new FactResolutionError({ kind: 'unresolved', path });
  }

  return {
    read(path: string): Json {
      // `actor.*` and `target.*` are shorthands rewritten to a concrete actor, so a rule
      // reads the same path whoever is acting.
      if (path.startsWith('actor.') && !store.has(path.split('.')[1] ?? '')) {
        return readActorScoped(`actor.${step.actorId}.${path.slice('actor.'.length)}`);
      }
      if (path.startsWith('actor.')) {
        return readActorScoped(path);
      }
      if (path.startsWith('target.')) {
        const targetId = primaryTargetId(step);
        if (targetId === undefined) {
          throw new FactResolutionError({ kind: 'no-target', path });
        }
        return readActorScoped(`actor.${targetId}.${path.slice('target.'.length)}`);
      }

      if (path.startsWith('step.')) {
        switch (path) {
          case 'step.id':
            return step.id;
          case 'step.round':
            return step.round;
          case 'step.actorId':
            return step.actorId;
          case 'step.index':
            return stepIndex;
          default:
            throw new FactResolutionError({ kind: 'unresolved', path });
        }
      }

      if (path.startsWith('action.')) {
        const action = step.action;
        if (action === null) return null;
        if (path === 'action.type') return action.type;
        const key = path.slice('action.'.length);
        // A field the current action kind does not have reads as `null`, and a comparison
        // against `null` then throws `ConditionTypeError` rather than silently skipping the
        // rule (FR-17). Rules guard on `action.type` first, and `all` short-circuits.
        const value = (action as unknown as Record<string, Json>)[key];
        return value === undefined ? null : value;
      }

      if (path.startsWith('intents.')) {
        const value = (intents as unknown as Record<string, Json>)[path.slice('intents.'.length)];
        return value === undefined ? null : value;
      }

      if (path.startsWith('scratch.') || path.startsWith('world.')) {
        return store.read(path);
      }

      // A registered derived path that is not actor-scoped, e.g. `damage.total`.
      if (!args.derivedSealed()) {
        throw new FactResolutionError({
          kind: 'derived-not-sealed',
          path,
          phase: args.currentPhase(),
        });
      }
      return store.derivedValue(path, step.actorId)?.total ?? null;
    },
  };
}
