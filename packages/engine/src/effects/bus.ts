/**
 * Where the `modifiers` phase leaves its work for the `roll`, `compare` and `damage` phases
 * to consume (ADR-0011's three channels).
 *
 * One bus per step, discarded with the step. Everything is keyed by a *resolved* `RollId`:
 * `$actor`/`$target` are resolved in the handler, because which actor they mean is a
 * property of the step, and nothing downstream should have to think about it again.
 *
 * Insertion order is preserved in every lane, and insertion order is the order the rules
 * ran — phase, then priority, then key (FR-9). That is what makes transform sequencing and
 * stacking deterministic without any lane needing a sort of its own.
 */

import type { RollModeInput } from '../dice';
import type { DieSelector, RollId, RollModeGrant, RollTransform } from '../schema';
import type { PendingModifier } from '../stacking';

export type ModeGrant = { ruleKey: string; rollId: RollId; mode: RollModeGrant };

export type TransformRequestRecord = {
  ruleKey: string;
  rollId: RollId;
  transform: RollTransform;
  uses: number;
  dieSelector: DieSelector;
};

export type DerivedGroup = {
  path: string;
  actorId: string;
  modifiers: readonly PendingModifier[];
};

export type StepBus = {
  grantMode(grant: ModeGrant): void;
  requestTransform(request: TransformRequestRecord): void;
  addRollModifier(rollId: RollId, modifier: PendingModifier): void;
  addDerivedModifier(path: string, actorId: string, modifier: PendingModifier): void;
  /** Ensures a group exists with no contributors, so a derived value always seals. */
  declareDerived(path: string, actorId: string): void;

  modeInputsFor(rollId: RollId): readonly RollModeInput[];
  transformRequestsFor(rollId: RollId): readonly TransformRequestRecord[];
  rollModifiersFor(rollId: RollId): readonly PendingModifier[];
  derivedGroups(): readonly DerivedGroup[];
};

function derivedKey(path: string, actorId: string): string {
  return `${path}\u0000${actorId}`;
}

export function createStepBus(): StepBus {
  const modes: ModeGrant[] = [];
  const transforms: TransformRequestRecord[] = [];
  const rollModifiers = new Map<RollId, PendingModifier[]>();
  const derived = new Map<
    string,
    { path: string; actorId: string; modifiers: PendingModifier[] }
  >();

  function derivedGroup(path: string, actorId: string) {
    const key = derivedKey(path, actorId);
    const existing = derived.get(key);
    if (existing !== undefined) return existing;
    const created = { path, actorId, modifiers: [] as PendingModifier[] };
    derived.set(key, created);
    return created;
  }

  return {
    grantMode: (grant) => void modes.push(grant),
    requestTransform: (request) => void transforms.push(request),
    addRollModifier(rollId, modifier) {
      const lane = rollModifiers.get(rollId);
      if (lane === undefined) rollModifiers.set(rollId, [modifier]);
      else lane.push(modifier);
    },
    addDerivedModifier(path, actorId, modifier) {
      derivedGroup(path, actorId).modifiers.push(modifier);
    },
    declareDerived(path, actorId) {
      derivedGroup(path, actorId);
    },

    modeInputsFor: (rollId) =>
      modes
        .filter((grant) => grant.rollId === rollId)
        .map((grant) => ({ ruleKey: grant.ruleKey, mode: grant.mode })),
    transformRequestsFor: (rollId) => transforms.filter((request) => request.rollId === rollId),
    rollModifiersFor: (rollId) => rollModifiers.get(rollId) ?? [],
    // Sorted by path then actor: a content-stable order, so a golden trace does not reshuffle
    // when a rule's priority changes. First-contribution order would also be deterministic,
    // but it is determined by the rules rather than by what is being derived.
    derivedGroups: () =>
      [...derived.values()].sort((a, b) =>
        a.path === b.path
          ? a.actorId < b.actorId
            ? -1
            : a.actorId > b.actorId
              ? 1
              : 0
          : a.path < b.path
            ? -1
            : 1,
      ),
  };
}
