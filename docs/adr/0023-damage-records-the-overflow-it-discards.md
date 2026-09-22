# ADR-0023: Damage clamps at 0 and reports what it discarded

- Status: accepted
- Date: 2026-09-22
- Closes Q22

## Context

Q22. `applyDamage` (`packages/engine/src/evaluator/action.ts`) computes
`Math.max(0, before - amount)` because `Actor.hpCurrent` is `nonnegative()` and the store
could not hold a negative. The damage past 0 is therefore discarded, silently: nothing in
the outcome or the trace says a creature was hit for 12 when it had 5 hit points left.

The SRD does use that overflow — instant death when it equals or exceeds the hit point
maximum — and ADR-0003 puts instant death out of scope. So the question is not whether to
*act* on the overflow, which is settled, but whether an engine whose selling point is an
explainable trace may quietly drop a number it computed.

A second thing came to light while looking: the `apply` phase emits no trace event at all,
and `applyDamage`'s returned `StateDelta` is discarded by its only caller in `step.ts`. The
one write the engine makes on its own behalf — `actor.<id>.hpCurrent` — never reaches the
trace, which FR-14 asks of a state change. The narrative ends at the `stacking` line and
never says the creature lost any hit points.

## Options

1. **State in the docs that the overflow is dropped.** Keep the code, delete the misleading
   comment, and say in `content-authoring.md` that damage saturates at 0.
   - Pros: no schema change; nothing to version.
   - Cons: it is the one arithmetic result the engine computes and refuses to show, in a
     project whose whole claim is that every number can be explained (FR-14, FR-15). And it
     leaves the `apply` phase silent, which is a separate defect this ADR would walk past.

2. **Let hit points go negative.** Drop `nonnegative()` from `Actor.hpCurrent`.
   - Pros: no new field; the overflow is implied by the number.
   - Cons: it moves a rule of the game into the schema, and it is the wrong rule — a
     creature at −7 hit points is not a state the SRD has. `ActorState` would then carry
     negatives into every stored `WorldState`, and every consumer would have to know to
     clamp for display. The schema would be lying to avoid a field.

3. **Clamp, and record the discarded amount (recommended).** Keep `nonnegative()`, add
   `overflow` to `DamageOutcome`, and give the `apply` phase the trace event it never had.
   - Pros: the clamp stays a clamp and becomes visible, which is exactly how ADR-0019
     closed Q19 for a roll transform that named a die outside the pool. It fixes the silent
     `apply` phase in the same change, because that is where the number lives.
   - Cons: a trace schema version bump for a field nothing reads yet.

## Decision

Option 3. Hit points still clamp at 0 and instant death stays out of scope; the overflow is
reported and nothing acts on it.

- `DamageOutcome` gains `overflow: number` — `amount - (hpBefore - hpAfter)`, normally 0.
- A new `damageApplied` trace event in the `apply` phase carries `actorId`, `damageType`,
  `amount`, `hpBefore`, `hpAfter`, `overflow` and the `deltas` that were being dropped.
- `narrateEvent` renders it, and mentions the overflow only when there is some, so an
  ordinary hit reads as it always did.

## Consequences

- `TRACE_SCHEMA_VERSION` goes to 3. Nothing is persisted yet — `packages/db` still has no
  Drizzle schema — so this is a correction before first persistence, as ADR-0019 and
  ADR-0021 were, and needs no migration.
- The narrative stops ending at the stacking line. Three golden cases gain an `[apply]`
  line; their `expected.json` outcome numbers do not change, which is what makes this a
  schema correction rather than a change of behaviour.
- `packages/engine/test/golden/cases/vulnerability-doubles-damage-past-zero-srd-5.1` is the
  first case to drive a creature to 0 hit points at all; the clamp had no end-to-end test.
- A future ADR that wanted instant death would have the number it needs already recorded,
  and would only have to decide what reads it.
- The comment in `applyDamage` claiming this was logged in `open-questions.md` — which it
  was not, until the commit that raised Q22 — is now simply true and points here.
