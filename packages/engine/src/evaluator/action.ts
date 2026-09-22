/**
 * The scaffolding around a step's declared action: which rolls exist, when they resolve,
 * what they are compared against, and how damage reaches hit points.
 *
 * The division of labour is ADR-0006's. The engine owns the *shape* — that an attack rolls
 * a d20 against the target's effective AC — and content owns every *number*, contributed
 * through the three channels. No SRD value is hard-coded here.
 */

import { makeRollId, type RollModeInput, resolveD20Roll, type TransformRequest } from '../dice';
import type { StepBus, WorldStateStore } from '../effects';
import type {
  CompareOutcome,
  CompareResult,
  DamageOutcome,
  Intents,
  RollId,
  RollOutcome,
  RollTarget,
  StateDelta,
  Step,
  TraceEventInput,
} from '../schema';
import { resolveStack } from '../stacking';
import { derivedTargetLabel } from './derived';

export type StepRolls = {
  /** Absent for `cast`, `useObject` and a step that takes no action. */
  d20?: { rollId: RollId; target: RollTarget };
  damage: { path: string; actorId: string };
};

export function declareStepRolls(step: Step, bus: StepBus): StepRolls {
  const action = step.action;
  const damage = { path: 'damage.total', actorId: step.actorId };
  bus.declareDerived(damage.path, damage.actorId);

  if (action === null || action.type === 'cast' || action.type === 'useObject') {
    return { damage };
  }

  const kind = action.type === 'attack' ? 'attack' : action.type === 'check' ? 'check' : 'save';
  const target: RollTarget = { kind, actorId: step.actorId };
  bus.declareDerived(`roll.${kind}.bonus`, step.actorId);

  if (action.type === 'attack') {
    // Effective AC always seals, even with nothing modifying it, so a comparison against it
    // has a base term to show rather than a missing value.
    bus.declareDerived('actor.ac.effective', action.targetId);
  }

  return { d20: { rollId: makeRollId(step.id, target), target }, damage };
}

/**
 * Expands each request into `uses` transforms, in collection order — which is rule priority
 * order (ADR-0011 step 3) — resolving the die each one touches.
 */
export function expandTransforms(
  bus: StepBus,
  rollId: RollId,
  intents: Intents,
): TransformRequest[] {
  const requests: TransformRequest[] = [];
  for (const record of bus.transformRequestsFor(rollId)) {
    const dieIndex =
      record.dieSelector.kind === 'fixed'
        ? record.dieSelector.index
        : // An `intent` selector with no declared choice defaults to die 0. That default is
          // a silent decision, which is why `content:lint` warns on it (ADR-0011).
          (intents.rollChoices?.[rollId]?.rerollDieIndex ?? 0);
    for (let use = 0; use < record.uses; use++) {
      requests.push({ ruleKey: record.ruleKey, transform: record.transform, dieIndex });
    }
  }
  return requests;
}

export function resolveActionRoll(args: {
  step: Step;
  rolls: StepRolls;
  bus: StepBus;
  roller: Parameters<typeof resolveD20Roll>[0]['roller'];
  intents: Intents;
}): { events: TraceEventInput[]; outcome: RollOutcome } | null {
  const declared = args.rolls.d20;
  if (declared === undefined) return null;

  const modeInputs: readonly RollModeInput[] = args.bus.modeInputsFor(declared.rollId);
  const roll = resolveD20Roll({
    roller: args.roller,
    rollId: declared.rollId,
    modeInputs,
    transforms: expandTransforms(args.bus, declared.rollId, args.intents),
  });

  const stack = resolveStack(args.bus.rollModifiersFor(declared.rollId));
  const total = roll.kept + stack.total;

  const events: TraceEventInput[] = [
    {
      stepId: args.step.id,
      round: args.step.round,
      phase: 'roll',
      kind: 'roll',
      rollId: declared.rollId,
      target: declared.target,
      mode: roll.mode,
      modeInputs: [...modeInputs],
      dice: roll.dice,
      transforms: roll.transforms.map(({ clamped: _clamped, ...rest }) => rest),
      diceAfterTransforms: roll.diceAfterTransforms,
      kept: roll.kept,
      keptIndex: roll.keptIndex,
      forced: roll.forced,
      modifiers: stack.applied,
      dropped: stack.dropped,
      total,
    },
  ];

  // ADR-0011 requires an out-of-range die selector to clamp *visibly*. The `roll` event's
  // `transforms[]` has no `clamped` field, so the clamp rides on its own event rather than
  // being swallowed. Logged in docs/open-questions.md as a trace-schema gap.
  for (const transform of roll.transforms) {
    if (transform.clamped) {
      events.push({
        stepId: args.step.id,
        round: args.step.round,
        phase: 'roll',
        kind: 'event',
        event: 'roll.transform.clamped',
        data: {
          rollId: declared.rollId,
          ruleKey: transform.ruleKey,
          usedDieIndex: transform.dieIndex,
        },
      });
    }
  }

  return {
    events,
    outcome: {
      rollId: declared.rollId,
      target: declared.target,
      mode: roll.mode,
      kept: roll.kept,
      modifiers: stack.applied,
      total,
      forced: roll.forced,
    },
  };
}

export function compareAction(args: {
  step: Step;
  rolls: StepRolls;
  store: WorldStateStore;
  roll: RollOutcome | null;
}): { event: TraceEventInput; outcome: CompareOutcome } | null {
  const action = args.step.action;
  const declared = args.rolls.d20;
  if (action === null || declared === undefined) return null;

  let dc: number;
  let result: CompareResult;
  const total = args.roll?.total ?? 0;

  if (action.type === 'attack') {
    // The target's effective AC, assembled by the `modifiers` phase — never printed AC.
    dc = args.store.derivedValue('actor.ac.effective', action.targetId)?.total ?? 0;
    result = total >= dc ? 'hit' : 'miss';
  } else if (action.type === 'check' || action.type === 'save') {
    dc = action.dc;
    result = total >= dc ? 'success' : 'failure';
  } else {
    return null;
  }

  return {
    event: {
      stepId: args.step.id,
      round: args.step.round,
      phase: 'compare',
      kind: 'compare',
      rollId: args.roll?.rollId ?? null,
      target: declared.target,
      total,
      dc,
      result,
    },
    outcome: {
      rollId: args.roll?.rollId ?? null,
      target: declared.target,
      total,
      dc,
      result,
    },
  };
}

/**
 * Damage has no d20, so it cannot be a `roll` event — that event requires a non-empty pool,
 * a mode and a kept die, and inventing them would be a lie. It is a derived value in exactly
 * ADR-0014's sense ("non-roll derived values — effective AC, damage") and reports as a
 * `stacking` event. `RollTargetKind` includes `'damage'` only so content can name the target.
 */
export function totalDamage(args: {
  step: Step;
  rolls: StepRolls;
  bus: StepBus;
  compare: CompareOutcome | null;
}): { event: TraceEventInput; total: number } | null {
  if (
    args.compare !== null &&
    (args.compare.result === 'miss' || args.compare.result === 'failure')
  ) {
    return null;
  }

  const modifiers = args.bus.rollModifiersFor(
    `${args.step.id}/damage:${args.rolls.damage.actorId}` as RollId,
  );
  const derived = args.bus
    .derivedGroups()
    .find((group) => group.path === args.rolls.damage.path)?.modifiers;
  const contributions = [...(derived ?? []), ...modifiers];
  if (contributions.length === 0) return null;

  const stack = resolveStack(contributions);

  return {
    event: {
      stepId: args.step.id,
      round: args.step.round,
      phase: 'damage',
      kind: 'stacking',
      target: derivedTargetLabel(args.rolls.damage.path, args.rolls.damage.actorId),
      applied: stack.applied,
      dropped: stack.dropped,
    },
    total: stack.total,
  };
}

export function applyDamage(args: {
  step: Step;
  store: WorldStateStore;
  amount: number;
  ruleKey: string;
}): { outcome: DamageOutcome; deltas: StateDelta[] } | null {
  const action = args.step.action;
  if (action === null || action.type !== 'attack' || args.amount <= 0) return null;

  const before = args.store.actor(action.targetId).hpCurrent;
  // Clamped at 0: `Actor.hpCurrent` is `nonnegative()`, so the store could not hold a
  // negative. Whether the SRD wants the overflow recorded is noted in open-questions.
  const hpAfter = Math.max(0, before - args.amount);
  const delta = args.store.write(`actor.${action.targetId}.hpCurrent`, hpAfter, args.ruleKey);

  return {
    outcome: {
      actorId: action.targetId,
      damageType: 'untyped',
      amount: args.amount,
      hpAfter,
    },
    deltas: [delta],
  };
}
