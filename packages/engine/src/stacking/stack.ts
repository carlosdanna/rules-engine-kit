/**
 * Stacking policies for numeric modifiers (FR-11), step 5 of ADR-0011's roll order and the
 * whole of a derived value's assembly (ADR-0006).
 *
 * Pure and roller-free: dice-valued modifiers are rolled when their `addModifier` effect is
 * applied, so by the time a modifier reaches here its `value` is a number. That is what lets
 * the property test generate modifier lists directly, and it means a modifier that is later
 * *dropped* still rolled its dice — correct, and visible through `DroppedModifier`.
 */

import type { AppliedModifier, DroppedModifier, StackPolicy } from '../schema';

/** A contribution after its dice were rolled and before any policy ran. */
export type PendingModifier = {
  ruleKey: string;
  modifierType: string;
  stackKey?: string;
  policy: StackPolicy;
  value: number;
  /** Present when the modifier was authored as dice, so "+3 bless" can show its d4. */
  rolled?: { expr: string; dice: number[] };
};

export type StackResult = {
  applied: AppliedModifier[];
  dropped: DroppedModifier[];
  /** The sum of `applied`. The caller adds the base — the kept die, printed AC, or zero. */
  total: number;
};

function toApplied(modifier: PendingModifier): AppliedModifier {
  // Spread the optionals conditionally: `exactOptionalPropertyTypes` distinguishes an
  // absent `stackKey` from one explicitly set to `undefined`, and the schema is strict.
  return {
    ruleKey: modifier.ruleKey,
    modifierType: modifier.modifierType,
    ...(modifier.stackKey === undefined ? {} : { stackKey: modifier.stackKey }),
    policy: modifier.policy,
    value: modifier.value,
    ...(modifier.rolled === undefined ? {} : { rolled: modifier.rolled }),
  };
}

/** `unique` with no `stackKey` means "one of this type". */
function dedupeKey(modifier: PendingModifier): string {
  return modifier.stackKey ?? modifier.modifierType;
}

function drop(
  modifier: PendingModifier,
  stage: StackPolicy,
  beatenBy: string | undefined,
): DroppedModifier {
  return {
    modifier: toApplied(modifier),
    // The stage that dropped it, which is not always the modifier's own declared policy.
    policy: stage,
    ...(beatenBy === undefined ? {} : { beatenBy }),
  };
}

/**
 * Groups by `modifierType` and runs each group through `unique` → `highest` → sum.
 *
 * Insertion order is the only tiebreak, and insertion order is collection order, which is
 * FR-9's phase → priority → key. No secondary sort is applied: re-sorting here would give
 * the modifier list an ordering of its own that the rule list does not have.
 *
 * Staging the two filters rather than electing one policy per group is what makes a group
 * whose members disagree well defined. `unique` and `highest` are genuinely incomparable —
 * `unique` can keep several entries under different stack keys, `highest` keeps exactly one
 * — so there is no honest ranking to pick a winner from. Running both in turn needs none,
 * and collapses to the ordinary meaning when a group agrees. Switching per modifier (as the
 * spike did) is the option rejected here: it lets a `sum` sibling escape a `highest`
 * constraint, so a layer could re-enable stacking that the base forbade.
 */
export function resolveStack(modifiers: readonly PendingModifier[]): StackResult {
  const groups = new Map<string, PendingModifier[]>();
  for (const modifier of modifiers) {
    const group = groups.get(modifier.modifierType);
    if (group === undefined) {
      groups.set(modifier.modifierType, [modifier]);
    } else {
      group.push(modifier);
    }
  }

  const applied: AppliedModifier[] = [];
  const dropped: DroppedModifier[] = [];

  for (const group of groups.values()) {
    let survivors = group;

    if (group.some((modifier) => modifier.policy === 'unique')) {
      const incumbents = new Map<string, PendingModifier>();
      const next: PendingModifier[] = [];
      for (const modifier of survivors) {
        const incumbent = incumbents.get(dedupeKey(modifier));
        if (incumbent === undefined) {
          incumbents.set(dedupeKey(modifier), modifier);
          next.push(modifier);
        } else {
          dropped.push(drop(modifier, 'unique', incumbent.ruleKey));
        }
      }
      survivors = next;
    }

    // Read from the authored group, not from `survivors`, for the same reason the stage
    // exists: "this type takes the highest" is a statement about the type, and it must not
    // evaporate because the rule that declared it happened to lose the dedupe above.
    if (group.some((modifier) => modifier.policy === 'highest')) {
      let winner = survivors[0];
      for (const modifier of survivors) {
        // Ties keep the earliest, so the winner is a function of the list alone.
        if (winner !== undefined && modifier.value > winner.value) {
          winner = modifier;
        }
      }
      if (winner !== undefined) {
        for (const modifier of survivors) {
          if (modifier !== winner) {
            dropped.push(drop(modifier, 'highest', winner.ruleKey));
          }
        }
        survivors = [winner];
      }
    }

    for (const modifier of survivors) {
      applied.push(toApplied(modifier));
    }
  }

  return { applied, dropped, total: applied.reduce((sum, modifier) => sum + modifier.value, 0) };
}
