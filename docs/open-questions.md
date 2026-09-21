# Open questions & risks

Decisions still to make. When one is settled, write an ADR in `docs/adr/` and remove it from here.

## Open questions

| # | Question | Blocks |
| --- | --- | --- |
| Q1 | Unit of work: one action, or a short sequence of actions across turns (needed to show durations expiring)? | M1 |
| Q2 | Derived stats (AC, attack bonus, save DC): fixture inputs or computed by rules? | M1 |
| Q3 | Time representation: rounds/turns shape; do durations tick at start or end of turn? | M1 |
| Q4 | Effect catalogue semantics: is `rollMode` separate from modifiers; how do rerolls interact with advantage? | M1 |
| Q5 | Precedence algorithm details; what fields `patch` may change | M1 |
| Q6 | Trace event schema and "why not" output shape | M1 |
| Q7 | Versioning: semver only, or semver + effective dates? | M2 |
| Q8 | Template placeholder rendering: inline fixture data vs keep references | M2 |
| Q9 | Fixture overrides per scenario; per-edition fixture variants | M2 |
| Q10 | Blank slate: form-first or JSON-first editor | M4 |
| Q11 | Profile selection by criteria (VR-5): in or out of the demo? | M2 |
| Q12 | Exit criteria per milestone | All |

## Top risks

| Risk | Mitigation |
| --- | --- |
| Rule model can't express durations and stacking cleanly | Spike Bless, prone and Heroic Inspiration first |
| Schema drift across templates, fixtures, scenarios, golden tests | One Zod schema with `schemaVersion`; lint renders every template |
| Rules silently never fire (JSON Logic missing vars → null) | Fact registry; lint and trace flag unknown facts |
| Non-SRD content slips into the public repo | Citation required on every rule/fixture |
| Hand-encoding takes longer than planned | Core-subset table is the scope contract |
| Golden snapshot churn | Assert outcomes separately from trace snapshots |
