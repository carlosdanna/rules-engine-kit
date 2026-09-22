# ADR-0019: Four trace and outcome schema corrections before first persistence

- Status: accepted
- Date: 2026-09-22
- Amends ADR-0014 (three event and outcome fields); closes Q17, Q18, Q19, Q20

## Context

Q17–Q20, all four found while implementing the evaluation loop (2026-09-22). Each has a working
answer in the engine today, and in each case the answer is a workaround in evaluator code for
something the schema cannot say:

- **Q17.** `stacking.target` is a bare string, so two actors' `actor.ac.effective` are
  indistinguishable. `evaluator/derived.ts` encodes `` `${path}@${actorId}` `` into it.
- **Q18.** `DerivedValue` has no step, so a 12-round run appends twelve look-alike
  `actor.ac.effective` entries to `Outcome.derived`, distinguishable only by their position and by
  the co-ordered `stacking` events beside them.
- **Q19.** The `roll` event's `transforms[]` has no `clamped` field, although `AppliedTransform`
  carries one and ADR-0011 requires an out-of-range die selector to clamp *visibly*. The evaluator
  strips the field and emits a generic `roll.transform.clamped` event instead.
- **Q20.** `Modifier` in `schema/effect.ts` is constructed nowhere. `addModifier` inlines its
  fields, `PendingModifier` is the engine-side record and `AppliedModifier` the trace record.

They were logged together because the honest fix to the first three is a trace-schema change and
ADR-0014 fixed `trace_schema_version` at 1. That constraint turns out not to bind: ADR-0014 set the
version to 1 precisely because it corrected ADR-0010 *before anything was implemented*, so no reader
had to handle 0. The same is true today. `packages/db` is a stub, there is no `evaluations` table,
and no trace has ever been stored or read by anything but a test in this repository. After M3 seeds
a database these become migrations; until then they are corrections.

## Options

1. **Leave all four, document the workarounds.** Ship the encoded target, the positional `derived`
   array and the synthetic event.
   - Pros: no churn in golden snapshots; the information is technically present in every case.
   - Cons: every consumer pays. `diffTraces` aligns on `(stepId, phase, ruleKey)` and would have to
     string-split a synthetic key to align a `stacking` event; the viewer must parse `@`; a reader of
     `Outcome.derived` must count. The workarounds are also load-bearing in a way nothing checks —
     an actor id containing `@` silently breaks Q17's encoding.

2. **Bump `trace_schema_version` to 2 and migrate.**
   - Pros: correct if a version 1 trace existed anywhere.
   - Cons: none does. A version bump would oblige every future reader to handle a shape that was
     never written, which is the exact cost ADR-0014 refused to impose.

3. **Correct the schema at version 1 (recommended).** Treat these as ADR-0014 treated ADR-0010's
   holes, and land them before M2 writes golden tests against the current shape.
   - Pros: the trace and outcome say what they mean; the evaluator loses three workarounds; M2's
     per-template golden tests are written once, against the final shape.
   - Cons: the existing golden trace snapshots move once, and this is the last moment it is free.

## Decision

Option 3, at `TRACE_SCHEMA_VERSION` 1.

- `stacking` gains `actorId: string`; `target` becomes the bare fact path.
- `DerivedValue` gains `stepId: string`.
- Each entry of the `roll` event's `transforms[]` gains `clamped: boolean`; the synthetic
  `roll.transform.clamped` event is removed.
- `Modifier` is deleted from `schema/effect.ts`.

## Consequences

- `evaluator/derived.ts` loses `derivedTargetLabel`, `evaluator/action.ts` loses the field-stripping
  map and the synthetic-event loop, and `stacking.target` is now the same string a fact registry
  registers — so a viewer can look a `stacking` event's target up in `facts.yaml`.
- `Outcome.derived` stays a flat array. Nesting it under `StepOutcome` would have been structurally
  tidier, but `diffOutcomes` (FR-16) aligns over flat arrays, and `(stepId, path, actorId)` is now a
  key it can align on.
- `roll.transforms[].clamped` puts the clamp on the thing that clamped. As a generic `event` it had
  untyped `Json` data, was invisible to anything rendering a roll, and would have surfaced in a trace
  diff as an unrelated extra event rather than as a difference on the roll.
- Deleting `Modifier` removes the fourth shape for one concept. The authored form is the
  `addModifier` effect, the engine-side form is `PendingModifier`, the trace form is
  `AppliedModifier`; a named type nothing constructs would drift, and `content:lint` would have to
  keep it in step with the effect it duplicates.
- Golden trace snapshots change once. Outcome assertions must not change except for the added
  `stepId`: NFR-4 keeps them separate so exactly this distinction is visible in review.
- This is the last such correction that is free. Once M3 stores an evaluation, a trace change costs
  a version bump and a migration, which is what `trace_schema_version` is stored for (VR-7).
