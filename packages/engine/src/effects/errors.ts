/**
 * The failures applying an effect throws on. Like the condition errors, these are authoring
 * or wiring bugs that must not resolve to a silent no-op (FR-17), and each message is worded
 * by a `describe*` so a future `content:lint` and the run-time error read identically.
 */

import type { EffectType } from '../schema';

export type EffectApplicationReason =
  | { kind: 'unwritable-path'; path: string }
  | { kind: 'unregistered-write'; path: string }
  | { kind: 'unknown-derived-target'; path: string }
  | { kind: 'unresolvable-actor-ref'; ref: string; why: 'no-target' | 'unknown-actor' }
  | { kind: 'fact-value-unusable'; path: string; value: string }
  | { kind: 'fact-value-flat-bonus'; path: string; value: string }
  | { kind: 'fact-value-not-dice'; path: string; value: string };

export function describeEffectApplication(
  reason: EffectApplicationReason,
  ruleKey: string,
  effectType: EffectType,
): string {
  const where = `\`${effectType}\` in rule '${ruleKey}'`;
  switch (reason.kind) {
    case 'unwritable-path':
      return `${where} cannot write '${reason.path}': only \`actor.<id>.hpCurrent\`, \`actor.<id>.conditions\`, \`scratch.*\` and \`world.*\` are writable`;
    case 'unregistered-write':
      return `${where} writes unregistered path '${reason.path}': a path a condition could never legally read must not be writable either`;
    case 'unknown-derived-target':
      return `${where} targets unregistered derived path '${reason.path}': every derived path must be declared in the pack's facts`;
    case 'unresolvable-actor-ref':
      return reason.why === 'no-target'
        ? `${where} names '${reason.ref}', but this step's action declares no target`
        : `${where} names unknown actor '${reason.ref}'`;
    case 'fact-value-unusable':
      return `${where} reads '${reason.path}' as ${reason.value}, which is neither a number nor dice notation: a fact-valued effect needs one of the two (ADR-0021)`;
    case 'fact-value-flat-bonus':
      return `${where} reads '${reason.path}' as ${reason.value}, which carries a flat bonus: the bonus would reach the roll without passing through a modifier channel and so could never have a stacking policy applied (FR-11, ADR-0011)`;
    case 'fact-value-not-dice':
      return `${where} needs dice, but '${reason.path}' reads as ${reason.value}: a number is a total, not something to roll`;
  }
}

export class EffectApplicationError extends Error {
  /** Stable across message wording, for callers that branch on the failure. */
  readonly code = 'EFFECT_APPLICATION';
  readonly reason: EffectApplicationReason;
  readonly ruleKey: string;
  readonly effectType: EffectType;

  constructor(reason: EffectApplicationReason, ruleKey: string, effectType: EffectType) {
    super(describeEffectApplication(reason, ruleKey, effectType));
    this.name = 'EffectApplicationError';
    this.reason = reason;
    this.ruleKey = ruleKey;
    this.effectType = effectType;
  }
}

export class UnknownActorError extends Error {
  readonly code = 'UNKNOWN_ACTOR';
  readonly actorId: string;

  constructor(actorId: string) {
    super(`unknown actor '${actorId}'`);
    this.name = 'UnknownActorError';
    this.actorId = actorId;
  }
}
