/** Builders for modifier lists. These are fixtures, not content. */

import type { PendingModifier } from '../../src/stacking';

export function modifier(
  ruleKey: string,
  modifierType: string,
  value: number,
  policy: PendingModifier['policy'],
  stackKey?: string,
): PendingModifier {
  return { ruleKey, modifierType, value, policy, ...(stackKey === undefined ? {} : { stackKey }) };
}
