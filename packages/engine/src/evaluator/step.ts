/**
 * One step of the timeline through the eight fixed phases (FR-9, ADR-0003).
 *
 * The load-bearing invariant is ADR-0010's: every rule selected for a phase emits exactly
 * one `rule` event, fired or not. That is what makes `explain()` a lookup rather than a
 * re-run, so no path through this loop may `continue` without recording something.
 */

import { evaluateCondition, type FactRegistry } from '../conditions';
import type { Roller } from '../dice';
import { makeRollId } from '../dice';
import { applyEffects, createStepBus, type EffectContext, type WorldStateStore } from '../effects';
import type {
  ActorRef,
  CompareOutcome,
  DamageOutcome,
  DerivedValue,
  EffectType,
  EmittedEvent,
  Intents,
  Item,
  Phase,
  PHASES as PhaseList,
  ResolvedProfile,
  ResolvedRule,
  RollOutcome,
  RollTarget,
  Step,
  StepOutcome,
  TimePoint,
} from '../schema';
import { PHASES } from '../schema';
import { sweepExpired, type TimelineIndex } from '../time';
import type { TraceBuilder } from '../trace';
import {
  applyDamage,
  compareAction,
  declareStepRolls,
  resolveActionRoll,
  totalDamage,
} from './action';
import { createActorRefResolver } from './actorRef';
import { sealDerivedValues } from './derived';
import { createFactSource } from './facts';
import { disablingLayer, lastProvenance, selectRules } from './select';

export type RunStepArgs = {
  step: Step;
  stepIndex: number;
  profile: ResolvedProfile;
  registry: FactRegistry;
  store: WorldStateStore;
  roller: Roller;
  timeline: TimelineIndex;
  trace: TraceBuilder;
  intents: Intents;
  /** The situation's inlined item fixtures, for `action.weapon.*` (ADR-0017). */
  items: Record<string, Item>;
  rulesByKey: ReadonlyMap<string, ResolvedRule>;
  nextEffectId(): string;
};

export type RunStepResult = {
  outcome: StepOutcome;
  derived: DerivedValue[];
  emitted: EmittedEvent[];
};

export function runStep(args: RunStepArgs): RunStepResult {
  const { step, stepIndex, store, trace } = args;

  store.beginStep();
  const bus = createStepBus();
  const resolveRef = createActorRefResolver({ step, has: (id) => store.has(id) });

  let halted: { ruleKey: string; reason: string } | null = null;
  let derivedSealed = false;
  let currentPhase: Phase = 'upkeep';

  const derived: DerivedValue[] = [];
  const emitted: EmittedEvent[] = [];
  const rolls: RollOutcome[] = [];
  const comparisons: CompareOutcome[] = [];
  const damage: DamageOutcome[] = [];

  const factSource = createFactSource({
    store,
    step,
    stepIndex,
    intents: args.intents,
    items: args.items,
    currentPhase: () => currentPhase,
    derivedSealed: () => derivedSealed,
  });

  const stepRolls = declareStepRolls(step, bus);
  let lastRoll: RollOutcome | null = null;
  let lastCompare: CompareOutcome | null = null;
  let damageTotal: number | null = null;

  function sweep(edge: 'start' | 'end'): void {
    const now: TimePoint = { round: step.round, stepIndex, edge };
    const { expired } = sweepExpired(store.activeEffects(), now);
    if (expired.length === 0) return;
    store.removeEffects((effect) => expired.includes(effect));
    for (const effect of expired) {
      trace.push({
        stepId: step.id,
        round: step.round,
        phase: currentPhase,
        kind: 'expiry',
        effectId: effect.id,
        sourceRuleKey: effect.sourceRuleKey,
        // The resolved point, which is the *anchor's* turn — not necessarily this step.
        at: effect.expiresAt.kind === 'at' ? effect.expiresAt.point : now,
      });
    }
  }

  function contextFor(rule: ResolvedRule): EffectContext {
    return {
      step,
      stepIndex,
      phase: currentPhase,
      now: { round: step.round, stepIndex, edge: 'start' },
      ruleKey: rule.key,
      store,
      bus,
      roller: args.roller,
      timeline: args.timeline,
      resolveActorRefs: (ref: ActorRef, effectType: EffectType) =>
        resolveRef(ref, rule.key, effectType),
      rollIdFor: (target: RollTarget) => makeRollId(step.id, target),
      derivedChannel: (path, actorId) => `${step.id}/derived:${actorId}:${path}`,
      nextEffectId: args.nextEffectId,
    };
  }

  for (const phase of PHASES as typeof PhaseList) {
    currentPhase = phase;

    if (phase === 'upkeep') sweep('start');

    for (const rule of selectRules(args.profile.rules, phase)) {
      const base = {
        stepId: step.id,
        round: step.round,
        phase,
        kind: 'rule' as const,
        ruleKey: rule.key,
        citation: rule.citation,
        provenance: lastProvenance(rule),
        deltas: [],
      };

      if (halted !== null) {
        // Recorded in this phase and every later one, so the viewer's (stepId, phase)
        // grouping stays intact and "why not" can be answered for a damage-phase rule.
        trace.push({
          ...base,
          status: 'skipped',
          reason: { kind: 'haltedEarlier', byRuleKey: halted.ruleKey },
          conditionResult: null,
          factsRead: [],
        });
        continue;
      }

      if (!rule.enabled) {
        trace.push({
          ...base,
          status: 'disabled',
          reason: { kind: 'disabledByLayer', layer: disablingLayer(rule) },
          conditionResult: null,
          factsRead: [],
        });
        continue;
      }

      // A null condition always applies once the rule is selected for its phase.
      const result =
        rule.condition === null
          ? { value: true, factsRead: [], failedAt: null }
          : evaluateCondition(rule.condition, args.registry, factSource);

      if (!result.value) {
        trace.push({
          ...base,
          status: 'skipped',
          // `failedAt` is `min(1)` and a node's pointer always has a token, so the fallback
          // is unreachable through `evaluateCondition` (ADR-0013).
          reason: { kind: 'conditionFalse', failedAt: result.failedAt ?? '/' },
          conditionResult: false,
          factsRead: result.factsRead,
        });
        continue;
      }

      const application = applyEffects(rule.effects, contextFor(rule));

      trace.push({
        ...base,
        status: 'fired',
        conditionResult: true,
        factsRead: result.factsRead,
        deltas: application.deltas,
      });
      // After the rule's own event, so `seq` order reads "fired, and here is what it did".
      trace.pushAll(application.events);
      emitted.push(...application.emitted);

      if (application.halt !== undefined) halted = application.halt;
    }

    if (halted === null) {
      if (phase === 'modifiers') {
        const sealed = sealDerivedValues({ bus, store, step, rulesByKey: args.rulesByKey });
        derived.push(...sealed.derived);
        trace.pushAll(sealed.events);
        derivedSealed = true;
      }

      if (phase === 'roll') {
        const resolved = resolveActionRoll({
          step,
          rolls: stepRolls,
          bus,
          roller: args.roller,
          intents: args.intents,
        });
        if (resolved !== null) {
          trace.pushAll(resolved.events);
          rolls.push(resolved.outcome);
          lastRoll = resolved.outcome;
        }
      }

      if (phase === 'compare') {
        const compared = compareAction({ step, rolls: stepRolls, store, roll: lastRoll });
        if (compared !== null) {
          trace.push(compared.event);
          comparisons.push(compared.outcome);
          lastCompare = compared.outcome;
        }
      }

      if (phase === 'damage') {
        const totalled = totalDamage({ step, rolls: stepRolls, bus, compare: lastCompare });
        if (totalled !== null) {
          trace.push(totalled.event);
          damageTotal = totalled.total;
        }
      }

      // `damage` totals it, `apply` spends it: the split is what lets an `apply`-phase rule
      // read the total and react before hit points move.
      if (phase === 'apply' && damageTotal !== null) {
        const applied = applyDamage({ step, store, amount: damageTotal, ruleKey: 'engine.damage' });
        if (applied !== null) damage.push(applied.outcome);
      }
    }

    // Runs even when the step halted. Expiry is a comparison against the timeline, not
    // something rules drive (ADR-0012): whether a creature was surprised must not change
    // when Bless ends.
    if (phase === 'expire') sweep('end');
  }

  return {
    outcome: {
      stepId: step.id,
      round: step.round,
      actorId: step.actorId,
      rolls,
      comparisons,
      damage,
      halted,
    },
    derived,
    emitted,
  };
}
