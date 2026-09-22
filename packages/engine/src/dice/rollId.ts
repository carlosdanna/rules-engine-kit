import type { RollId, RollTarget } from '../schema';

/**
 * Roll ids are the join key across the trace, `forcedRolls` and `intents.rollChoices`
 * (ADR-0011), and they are derivable from the situation *before* evaluation so a template
 * can pre-declare which die a reroll touches.
 *
 * `` `${stepId}/${kind}:${actorId}` `` plus a channel suffix for dice that are not the d20
 * itself. There is no per-die `#n` suffix: `forcedRolls` is `Record<RollId, number[]>`, so
 * position in that array indexes the dice within a channel — both dice of an advantage pair
 * on the base id, one value per reroll use on `:reroll`. (The spike proposed `#n`; the
 * schema's array keying supersedes it.)
 */

/** Rerolls draw from their own channel, so adding a rule cannot shift the attack's dice. */
export const REROLL_CHANNEL = 'reroll';

function assertToken(token: string, label: string): void {
  if (token.length === 0) {
    throw new Error(`a roll id needs a non-empty ${label}`);
  }
  if (token.includes('/') || token.includes(':')) {
    throw new Error(`a roll id ${label} may not contain '/' or ':', got '${token}'`);
  }
}

export function makeRollId(stepId: string, target: RollTarget, channel?: string): RollId {
  assertToken(stepId, 'step id');
  assertToken(target.actorId, 'actor id');
  const base = `${stepId}/${target.kind}:${target.actorId}`;
  return channel === undefined ? base : withChannel(base, channel);
}

/** A dice-valued modifier rolls on its own channel, named for the modifier type. */
export function withChannel(rollId: RollId, channel: string): RollId {
  assertToken(channel, 'channel');
  return `${rollId}:${channel}`;
}
