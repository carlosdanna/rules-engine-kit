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

Settled: Q1–Q6 by ADR-0005 to ADR-0010, Q13–Q15 by ADR-0011 to ADR-0013 (2026-09-21).
ADR-0011 supersedes ADR-0008, ADR-0012 supersedes ADR-0007, ADR-0014 supersedes ADR-0010,
ADR-0013 amends ADR-0001 and ADR-0011 amends ADR-0005.

## Top risks

| Risk | Mitigation |
| --- | --- |
| Rule model can't express durations and stacking cleanly | Spiked 2026-09-21 (`docs/spike-notes.md`): the shapes hold; ADR-0007's durations and ADR-0008's roll order were wrong in detail and are superseded by ADR-0012 and ADR-0011 |
| Schema drift across templates, fixtures, scenarios, golden tests | One Zod schema with `schemaVersion`; lint renders every template |
| Rules silently never fire (JSON Logic missing vars → null) | Fact registry; lint and trace flag unknown facts. Not covered by the spike — `json-logic-js` cannot report facts read or the failing sub-expression, so ADR-0013 replaces it with our own evaluator |
| Non-SRD content slips into the public repo | Citation required on every rule/fixture |
| Hand-encoding takes longer than planned | Core-subset table is the scope contract |
| Golden snapshot churn | Assert outcomes separately from trace snapshots |
