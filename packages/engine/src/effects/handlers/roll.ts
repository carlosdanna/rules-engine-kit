/**
 * The four channels that act on a roll or its damage (ADR-0011, ADR-0025): numeric
 * modifiers, roll mode, roll transforms, and the multiplicative damage scale. None of them
 * emits a trace event — each record surfaces later, on the `roll` event that consumed it or
 * on the `stacking` or `damageScale` event that resolved it (ADR-0014).
 */

import { withChannel } from '../../dice';
import type {
  Effect,
  EffectType,
  ModifierTargetRef,
  RollTarget,
  RollTargetRef,
} from '../../schema';
import { rollModifierValue } from '../../stacking';
import type { EffectApplication, EffectContext } from '../context';
import { emptyApplication } from '../context';
import { resolveEffectValue } from '../factValue';

/** `RollTargetRef` carries `kind`, `DerivedTargetRef` carries `path`. */
function isRollTargetRef(target: ModifierTargetRef): target is RollTargetRef {
  return 'kind' in target;
}

function resolvedTargets(
  ref: RollTargetRef,
  ctx: EffectContext,
  effectType: EffectType,
): RollTarget[] {
  return ctx
    .resolveActorRefs(ref.actor, effectType)
    .map((actorId) => ({ kind: ref.kind, actorId }));
}

export function addModifier(
  effect: Extract<Effect, { type: 'addModifier' }>,
  ctx: EffectContext,
): EffectApplication {
  const stackKey = effect.stackKey === undefined ? {} : { stackKey: effect.stackKey };
  // Read once for the effect, not once per target: the path is a property of the rule, and
  // a `$target` naming three creatures must not read three different numbers (ADR-0021).
  const resolved = resolveEffectValue(effect.value, ctx, 'addModifier');
  const fromFact = resolved.fromFact === undefined ? {} : { fromFact: resolved.fromFact };

  if (isRollTargetRef(effect.target)) {
    for (const target of resolvedTargets(effect.target, ctx, 'addModifier')) {
      const rollId = ctx.rollIdFor(target);
      // Dice roll now, when the effect is applied, not at stacking time: that keeps
      // `resolveStack` pure, and a modifier later dropped still shows the dice it rolled.
      const rolled = rollModifierValue({
        value: resolved.value,
        roller: ctx.roller,
        channel: withChannel(rollId, effect.modifierType),
      });
      ctx.bus.addRollModifier(rollId, {
        ruleKey: ctx.ruleKey,
        modifierType: effect.modifierType,
        ...stackKey,
        policy: effect.policy,
        ...rolled,
        ...fromFact,
      });
    }
    return emptyApplication();
  }

  for (const actorId of ctx.resolveActorRefs(effect.target.actor, 'addModifier')) {
    const rolled = rollModifierValue({
      value: resolved.value,
      roller: ctx.roller,
      channel: withChannel(ctx.derivedChannel(effect.target.path, actorId), effect.modifierType),
    });
    ctx.bus.addDerivedModifier(effect.target.path, actorId, {
      ruleKey: ctx.ruleKey,
      modifierType: effect.modifierType,
      ...stackKey,
      policy: effect.policy,
      ...rolled,
      ...fromFact,
    });
  }
  return emptyApplication();
}

export function rollMode(
  effect: Extract<Effect, { type: 'rollMode' }>,
  ctx: EffectContext,
): EffectApplication {
  // No cancelling here: advantage and disadvantage cancel as a *set* over every grant, which
  // `resolveRollMode` does once the whole phase has contributed (ADR-0011 step 1).
  for (const target of resolvedTargets(effect.target, ctx, 'rollMode')) {
    ctx.bus.grantMode({ ruleKey: ctx.ruleKey, rollId: ctx.rollIdFor(target), mode: effect.mode });
  }
  return emptyApplication();
}

export function rollTransform(
  effect: Extract<Effect, { type: 'rollTransform' }>,
  ctx: EffectContext,
): EffectApplication {
  // `uses` and `dieSelector` stay unexpanded: the selector resolves against
  // `intents.rollChoices` at roll time, when the pool exists to index into.
  for (const target of resolvedTargets(effect.target, ctx, 'rollTransform')) {
    ctx.bus.requestTransform({
      ruleKey: ctx.ruleKey,
      rollId: ctx.rollIdFor(target),
      transform: effect.transform,
      uses: effect.uses,
      dieSelector: effect.dieSelector,
    });
  }
  return emptyApplication();
}

export function scaleDamage(
  effect: Extract<Effect, { type: 'scaleDamage' }>,
  ctx: EffectContext,
): EffectApplication {
  // No collapse here, for the reason `rollMode` gives: resistance and vulnerability
  // deduplicate as a *set* over every grant, which `resolveDamageScale` does once the whole
  // phase has contributed (ADR-0025).
  for (const target of resolvedTargets(effect.target, ctx, 'scaleDamage')) {
    ctx.bus.scaleDamage({
      ruleKey: ctx.ruleKey,
      rollId: ctx.rollIdFor(target),
      scale: effect.scale,
    });
  }
  return emptyApplication();
}
