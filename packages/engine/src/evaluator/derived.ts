/**
 * Assembling the derived values ADR-0006 puts at the centre of the model: fixtures hold
 * only what the SRD prints, and every situational number is built from modifier terms so
 * the trace can render "10 base + 3 Dex + 2 cover = 15" (FR-8).
 *
 * Sealed at the end of the `modifiers` phase. Until then the value does not exist, and a
 * condition that asks for it gets an error rather than a half-assembled total.
 */

import type { ActorRecord, StepBus, WorldStateStore } from '../effects';
import type { DerivedValue, ResolvedRule, Step, TraceEventInput } from '../schema';
import { resolveStack } from '../stacking';
import { lastProvenance } from './select';

/** Where a derived path starts before any rule contributes. */
export const DERIVED_BASES: Record<string, (actor: ActorRecord) => number> = {
  // Printed AC. Cover, spells and layers modify the effective value, never this (ADR-0006).
  'actor.ac.effective': (actor) => actor.ac,
};

/** `stacking.target` is a bare string in the schema, so the actor is encoded into it. */
export function derivedTargetLabel(path: string, actorId: string): string {
  return `${path}@${actorId}`;
}

/** A roll's modifiers ride on its own `roll` event, so these get no `stacking` event. */
function isRollTarget(path: string): boolean {
  return path.startsWith('roll.') || path.startsWith('damage.');
}

export function sealDerivedValues(args: {
  bus: StepBus;
  store: WorldStateStore;
  step: Step;
  rulesByKey: ReadonlyMap<string, ResolvedRule>;
}): { derived: DerivedValue[]; events: TraceEventInput[] } {
  const derived: DerivedValue[] = [];
  const events: TraceEventInput[] = [];

  for (const group of args.bus.derivedGroups()) {
    const base = DERIVED_BASES[group.path]?.(args.store.actor(group.actorId)) ?? 0;
    const { applied, dropped, total } = resolveStack(group.modifiers);

    const value: DerivedValue = {
      path: group.path,
      actorId: group.actorId,
      base,
      terms: applied.map((modifier) => ({
        // `ruleKey` and `modifierType` already say which rule and which label, so `source`
        // carries the one thing neither does: the layer the contribution came from, which
        // is what lets /compare show that a term arrived with a house-rules layer.
        source: (() => {
          const rule = args.rulesByKey.get(modifier.ruleKey);
          return rule === undefined ? modifier.ruleKey : lastProvenance(rule).layer;
        })(),
        ruleKey: modifier.ruleKey,
        value: modifier.value,
        modifierType: modifier.modifierType,
      })),
      total: base + total,
    };

    args.store.sealDerived(value);
    derived.push(value);

    if (!isRollTarget(group.path)) {
      events.push({
        stepId: args.step.id,
        round: args.step.round,
        phase: 'modifiers',
        kind: 'stacking',
        target: derivedTargetLabel(group.path, group.actorId),
        applied,
        dropped,
      });
    }
  }

  return { derived, events };
}
