/**
 * `applyCondition` and `removeCondition`: the only effects that create or end an
 * `ActiveEffect`, and so the only ones that touch durations (ADR-0012).
 */

import type { AnchorRef, Effect } from '../../schema';
import { resolveExpiry } from '../../time';
import type { EffectApplication, EffectContext } from '../context';
import { emptyApplication } from '../context';

/**
 * `source` is whoever's rule applied the effect, `target` is the actor carrying this
 * instance — well defined because the caller is already iterating one actor at a time.
 * Returning `null` for a duration that needs no anchor keeps `src/time/` free of refs.
 */
function anchorActor(anchor: AnchorRef, carrierId: string, ctx: EffectContext): string {
  switch (anchor.kind) {
    case 'source':
      return ctx.step.actorId;
    case 'target':
      return carrierId;
    case 'actor':
      return anchor.actorId;
  }
}

export function applyCondition(
  effect: Extract<Effect, { type: 'applyCondition' }>,
  ctx: EffectContext,
): EffectApplication {
  const application = emptyApplication();

  for (const actorId of ctx.resolveActorRefs(effect.actor, 'applyCondition')) {
    // Narrowed on the duration itself rather than through a boolean: only these two kinds
    // carry an anchor, and `instant`/`permanent` must pass `null` through to `src/time/`.
    const duration = effect.duration;
    const anchorActorId =
      duration.kind === 'untilTurn' || duration.kind === 'rounds'
        ? anchorActor(duration.anchor, actorId, ctx)
        : null;
    const expiresAt = resolveExpiry({
      duration,
      appliedAt: ctx.now,
      anchorActorId,
      timeline: ctx.timeline,
    });

    const id = ctx.nextEffectId();
    ctx.store.addEffect({
      id,
      sourceRuleKey: ctx.ruleKey,
      actorId,
      condition: effect.condition,
      duration: effect.duration,
      appliedAt: ctx.now,
      expiresAt,
    });

    application.events.push({
      stepId: ctx.step.id,
      round: ctx.step.round,
      // The phase the effect was applied in, not a hard-coded 'apply': a Bless applied
      // during `modifiers` belongs under that phase's header.
      phase: ctx.phase,
      kind: 'effectApplied',
      effectId: id,
      sourceRuleKey: ctx.ruleKey,
      onActorId: actorId,
      expiresAt,
    });
  }

  return application;
}

export function removeCondition(
  effect: Extract<Effect, { type: 'removeCondition' }>,
  ctx: EffectContext,
): EffectApplication {
  const application = emptyApplication();

  for (const actorId of ctx.resolveActorRefs(effect.actor, 'removeCondition')) {
    const removed = ctx.store.removeEffects(
      (active) => active.actorId === actorId && active.condition === effect.condition,
    );
    for (const active of removed) {
      application.events.push({
        stepId: ctx.step.id,
        round: ctx.step.round,
        phase: ctx.phase,
        kind: 'expiry',
        effectId: active.id,
        sourceRuleKey: active.sourceRuleKey,
        at: ctx.now,
      });
    }
  }

  return application;
}
