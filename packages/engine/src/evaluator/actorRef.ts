/**
 * Resolving `$actor` and `$target` against the step (content-authoring.md: "`$actor` is
 * whoever is taking the step, `$target` the action's target").
 *
 * Returns a list rather than one id, because a `cast` action names several targets and
 * Bless on three creatures must apply three times.
 */

import { EffectApplicationError } from '../effects';
import type { ActorRef, EffectType, Step } from '../schema';

export function targetsOf(step: Step): string[] {
  const action = step.action;
  if (action === null) return [];
  switch (action.type) {
    case 'attack':
      return [action.targetId];
    case 'cast':
      return [...action.targetIds];
    default:
      return [];
  }
}

/** The single target `target.*` fact paths mean; the first when an action names several. */
export function primaryTargetId(step: Step): string | undefined {
  return targetsOf(step)[0];
}

export function createActorRefResolver(args: {
  step: Step;
  has(actorId: string): boolean;
}): (ref: ActorRef, ruleKey: string, effectType: EffectType) => readonly string[] {
  return (ref, ruleKey, effectType) => {
    if (ref === '$actor') return [args.step.actorId];

    if (ref === '$target') {
      const targets = targetsOf(args.step);
      if (targets.length === 0) {
        throw new EffectApplicationError(
          { kind: 'unresolvable-actor-ref', ref, why: 'no-target' },
          ruleKey,
          effectType,
        );
      }
      return targets;
    }

    if (!args.has(ref)) {
      throw new EffectApplicationError(
        { kind: 'unresolvable-actor-ref', ref, why: 'unknown-actor' },
        ruleKey,
        effectType,
      );
    }
    return [ref];
  };
}
