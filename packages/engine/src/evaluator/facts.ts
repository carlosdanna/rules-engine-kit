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
import { formatDiceNotation } from '../dice';
import type { WorldStateStore } from '../effects';
import type { CompareResult, Intents, Item, Json, Phase, Step } from '../schema';
import { primaryTargetId } from './actorRef';
import { FactResolutionError } from './errors';

const ABILITY = /^actor\.([^.]+)\.abilities\.([^.]+)$/;
const ABILITY_MOD = /^actor\.([^.]+)\.abilityMod\.([^.]+)$/;
const ACTOR_FIELD = /^actor\.([^.]+)\.(name|ac|hp|hpCurrent|proficiencyBonus|conditions)$/;

/**
 * What the `compare` phase has decided for this step, as the fact source sees it
 * (ADR-0021). Three-way, because "not yet" and "this step rolls no d20" are different
 * answers and neither is a value: a `useObject` step never has a result, while an attack
 * read during `modifiers` has one that does not exist *yet*, and telling an author which
 * mistake they made is the whole point of not returning `null`.
 */
export type StepResultView =
  | { kind: 'pending' }
  | { kind: 'none' }
  | { kind: 'decided'; result: CompareResult; natural: number; total: number };

/** The three paths a rule reads a decided roll through. */
const RESULT_PATHS = ['step.attack.result', 'step.attack.natural', 'step.attack.total'] as const;

export type FactSourceArgs = {
  store: WorldStateStore;
  step: Step;
  stepIndex: number;
  intents: Intents;
  /** The situation's inlined item fixtures, keyed by slug (ADR-0017). */
  items: Record<string, Item>;
  /** Read when a derived value is asked for too early, so the error can name the phase. */
  currentPhase(): Phase;
  derivedSealed(): boolean;
  /** What `compare` has decided so far, for `step.attack.*` (ADR-0021). */
  stepResult(): StepResultView;
};

function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function createFactSource(args: FactSourceArgs): FactSource {
  const { store, step, stepIndex, intents, items } = args;

  /**
   * The weapon's own fields, from the index the situation inlines them into (ADR-0017).
   * Everything here fits the `FactType` vocabulary a pack can register, which is why the
   * dice come back as notation (`1d8`) with `count` and `sides` beside them for arithmetic.
   */
  function readWeapon(rest: string): Json {
    const action = step.action;
    if (action === null || action.type !== 'attack' || action.weapon === null) return null;
    // The situation schema rejects a slug with no entry, so a miss here is an engine gap.
    const item = items[action.weapon];
    if (item === undefined) {
      throw new FactResolutionError({ kind: 'unresolved', path: `action.weapon.${rest}` });
    }

    switch (rest) {
      case 'slug':
        return item.slug;
      case 'name':
        return item.name;
      case 'properties':
        return [...item.properties];
      case 'mastery':
        return item.mastery;
      case 'damage.dice':
        return item.damage === null ? null : formatDiceNotation(item.damage.dice);
      case 'damage.count':
        return item.damage === null ? null : item.damage.dice.count;
      case 'damage.sides':
        return item.damage === null ? null : item.damage.dice.sides;
      case 'damage.type':
        return item.damage === null ? null : item.damage.type;
      default:
        throw new FactResolutionError({ kind: 'unresolved', path: `action.weapon.${rest}` });
    }
  }

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

      // The step's own d20, once `compare` has decided it: what a critical hit and a
      // weapon mastery's "if you hit" read (ADR-0021). `attack` names the step's action
      // rather than the roll's kind, so a check reads `step.attack.result` = 'success'.
      if ((RESULT_PATHS as readonly string[]).includes(path)) {
        const result = args.stepResult();
        if (result.kind === 'none') {
          throw new FactResolutionError({ kind: 'no-roll', path });
        }
        if (result.kind === 'pending') {
          throw new FactResolutionError({
            kind: 'result-not-decided',
            path,
            phase: args.currentPhase(),
          });
        }
        if (path === 'step.attack.result') return result.result;
        return path === 'step.attack.natural' ? result.natural : result.total;
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

      if (path.startsWith('action.weapon.')) {
        return readWeapon(path.slice('action.weapon.'.length));
      }

      if (path.startsWith('action.')) {
        const action = step.action;
        // `action.type` is total, because a step that takes no action is legal and rules
        // guard on this fact before reading any other. Returning `null` here would make the
        // one path every condition starts with throw on a perfectly valid step; `'none'` is
        // a value, and "took no action" is a real answer rather than a missing one.
        if (path === 'action.type') return action === null ? 'none' : action.type;
        if (action === null) return null;
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
