# Open questions & risks

Decisions still to make. When one is settled, write an ADR in `docs/adr/` and remove it from here.

## Open questions

Numbers are stable; a settled question keeps its number in the ADR that closed it.

| # | Question | Blocks |
| --- | --- | --- |
| Q7 | Versioning: semver only, or semver + effective dates? | M2 |
| Q8 | Template placeholder rendering: inline fixture data vs keep references | M2 |
| Q9 | Fixture overrides per scenario; per-edition fixture variants | M2 |
| Q10 | Blank slate: form-first or JSON-first editor | M4 |
| Q11 | Profile selection by criteria (VR-5): in or out of the demo? | M2 |
| Q12 | Exit criteria per milestone | All |
| Q16 | May a layer extend another layer in the same stack, or only the base at position 0? | M2 |
| Q17 | `stacking.target` is a bare string, so two actors' `actor.ac.effective` are indistinguishable. The evaluator encodes `` `${path}@${actorId}` ``; should the event carry `actorId` as a field instead? | M3 |
| Q18 | `Outcome.derived` has no `stepId`, so a 12-round run's twelve derivations of one path collapse into look-alike entries. They are appended in evaluation order and the co-ordered `stacking` events carry the step; should `DerivedValue` carry it? | M3 |
| Q19 | The `roll` event's `transforms[]` has no `clamped` field, although `AppliedTransform.clamped` exists and ADR-0011 requires the clamp be visible. The evaluator emits a separate `roll.transform.clamped` event; should it be a field? | M3 |
| Q20 | `Modifier` (`schema/effect.ts`) is unused: `addModifier` inlines its fields, and the engine-side record needs a resolved numeric value plus `rolled`, which `Modifier.value: ModifierValue` cannot carry. `PendingModifier` in `src/stacking/` is the live type. Reshape `Modifier` or delete it? | M2 |

Q17–Q20 were found while implementing the evaluation loop (2026-09-22). Each has a working
answer in the engine today, documented in the module that makes it; they are here because the
honest fix to Q17–Q19 is a trace-schema change, and ADR-0014 fixed `trace_schema_version` at 1.

Settled: Q1–Q6 by ADR-0005 to ADR-0010, Q13–Q15 by ADR-0011 to ADR-0013 (2026-09-21).
ADR-0011 supersedes ADR-0008, ADR-0012 supersedes ADR-0007, ADR-0014 supersedes ADR-0010,
ADR-0013 amends ADR-0001 and ADR-0011 amends ADR-0005.

## Top risks

| Risk | Mitigation |
| --- | --- |
| Rule model can't express durations and stacking cleanly | Spiked 2026-09-21 (`docs/spike-notes.md`): the shapes hold; ADR-0007's durations and ADR-0008's roll order were wrong in detail and are superseded by ADR-0012 and ADR-0011 |
| Schema drift across templates, fixtures, scenarios, golden tests | One Zod schema with `schemaVersion`; lint renders every template |
| Rules silently never fire (JSON Logic missing vars → null) | Fact registry; lint and trace flag unknown facts. Not covered by the spike — `json-logic-js` cannot report facts read or the failing sub-expression, so ADR-0013 replaces it with our own evaluator |
| A registered fact a situation never declares throws rather than defaulting | Correct per ADR-0013, but sharp: an `intents.*` boolean a rule reads must be declared on every situation, or the comparison throws. `content:lint` should render every template and flag a rule whose condition can reach an undeclared intent |
| Non-SRD content slips into the public repo | Citation required on every rule/fixture |
| Hand-encoding takes longer than planned | Core-subset table is the scope contract |
| Golden snapshot churn | Assert outcomes separately from trace snapshots |
