# Open questions & risks

Decisions still to make. When one is settled, write an ADR in `docs/adr/` and remove it from here.

## Open questions

Numbers are stable; a settled question keeps its number in the ADR that closed it.

| # | Question | Blocks |
| --- | --- | --- |
| Q21 | A rule can now *read* a weapon's dice (`action.weapon.damage.dice`, ADR-0017) but `rollDice.expr` is a literal, so an effect cannot use what a condition read. Either damage rules are written per weapon, duplicating fixture data, or an effect's value gains a "read this fact path" form. | M2 |
| Q22 | Damage is clamped at 0 because `Actor.hpCurrent` is `nonnegative()` (`evaluator/action.ts`), so overflow past 0 is discarded. The SRD uses it for instant death, which ADR-0003 puts out of scope — record the overflow anyway, or state that it is dropped? | M2 |
| Q23 | `architecture.md`'s `fixtures` table has a third kind, `effect`, which `content-authoring.md` never specifies — nothing says what its `data` holds. `FixtureKind` is `actor \| item` until it does. Write the shape, or drop the kind? | M3 |
| Q24 | Three checks `content-authoring.md` promises need a rendered situation and so need `renderTemplate`, which is unwritten: every template renders with its defaults into a valid `Situation`; every `suggestedProfiles` entry resolves each fixture slug to exactly one variant (ADR-0017); and a `dieSelector: intent` whose roll has no declared choice, which `schema/effect.ts` says is warned about. Until then a template and a fixture are checked against their schemas alone. | M2 |

Q21 and Q22 were found while closing Q7–Q20 (2026-09-22). Q22 is not new: a comment in
`applyDamage` already claimed it was logged here, and it was not.

Q23 and Q24 were found while implementing the content loader and `pnpm content:lint`
(2026-09-22). Neither blocks that command; both block a criterion it is part of.

Settled: Q1–Q6 by ADR-0005 to ADR-0010, Q13–Q15 by ADR-0011 to ADR-0013 (2026-09-21),
Q7–Q12 and Q16–Q20 by ADR-0015 to ADR-0019 (2026-09-22).
ADR-0011 supersedes ADR-0008, ADR-0012 supersedes ADR-0007, ADR-0014 supersedes ADR-0010,
ADR-0013 amends ADR-0001, ADR-0011 amends ADR-0005, and ADR-0019 amends ADR-0014.

Q7 and Q11 were closed as **won't-do**: VR-5 and VR-6 are out of scope for this demo (ADR-0016).

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
