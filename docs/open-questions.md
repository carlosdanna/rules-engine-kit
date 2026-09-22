# Open questions & risks

Decisions still to make. When one is settled, write an ADR in `docs/adr/` and remove it from here.

## Open questions

Numbers are stable; a settled question keeps its number in the ADR that closed it.

| # | Question | Blocks |
| --- | --- | --- |
| Q24 | Three checks `content-authoring.md` promises need a rendered situation and so need `renderTemplate`: every template renders with its defaults into a valid `Situation`; every `suggestedProfiles` entry resolves each fixture slug to exactly one variant (ADR-0017); and a `dieSelector: intent` whose roll has no declared choice, which `schema/effect.ts` says is warned about. Until then a template and a fixture are checked against their schemas alone. | M2 |

Q24 is not a decision that is stuck: `renderTemplate` is already an M2 exit criterion
(FR-18, FR-19, FR-20), and ADR-0017 fixed its contract. It stays listed because the three
checks are promised in `content-authoring.md` today and are not performed, so the row is the
record of a debt rather than of an argument. Two things will have to be decided when it is
written, and neither has been: what a `suggestedProfiles` string maps to — no pack declares
the ids `srd-5.1` and `srd-5.2.1` that templates and fixtures both use — and what type
indexes a fixture slug to one variant under a profile.

There are no templates under `content/` yet, so nothing is currently unchecked in practice.

Q22, Q23 and Q25 were found while closing Q7–Q20 and while writing the SRD packs, and are
settled below.

Settled: Q1–Q6 by ADR-0005 to ADR-0010, Q13–Q15 by ADR-0011 to ADR-0013 (2026-09-21),
Q7–Q12 and Q16–Q20 by ADR-0015 to ADR-0019, Q21 by ADR-0021, Q22 by ADR-0023, Q23 by
ADR-0024 and Q25 by ADR-0025 (2026-09-22). ADR-0022 was written the same day for a gap no
question had been raised for: a nullable field the situation schema carries on purpose could
not be read by a rule at all.
ADR-0011 supersedes ADR-0008, ADR-0012 supersedes ADR-0007, ADR-0014 supersedes ADR-0010,
ADR-0013 amends ADR-0001, ADR-0011 amends ADR-0005, ADR-0019 amends ADR-0014, and ADR-0025
amends ADR-0011.

Q7 and Q11 were closed as **won't-do**: VR-5 and VR-6 are out of scope for this demo (ADR-0016).
ADR-0024 closed Q23 the same way, by deleting the obligation rather than meeting it: the
`effect` fixture kind is gone from `architecture.md` instead of being specified.

## Top risks

| Risk | Mitigation |
| --- | --- |
| Rule model can't express durations and stacking cleanly | Spiked 2026-09-21 (`docs/spike-notes.md`): the shapes hold; ADR-0007's durations and ADR-0008's roll order were wrong in detail and are superseded by ADR-0012 and ADR-0011 |
| Schema drift across templates, fixtures, scenarios, golden tests | One Zod schema with `schemaVersion`; lint renders every template |
| Rules silently never fire (JSON Logic missing vars → null) | Fact registry; lint and trace flag unknown facts. Not covered by the spike — `json-logic-js` cannot report facts read or the failing sub-expression, so ADR-0013 replaces it with our own evaluator |
| A registered fact a situation never declares throws rather than defaulting | Correct per ADR-0013, but sharp: an `intents.*` boolean a rule reads must be declared on every situation, or the comparison throws. `content:lint` should render every template and flag a rule whose condition can reach an undeclared intent |
| Non-SRD content slips into the public repo | Citation required on every rule/fixture |
| Hand-encoding takes longer than planned | Core-subset table is the scope contract; every row of it is authorable since ADR-0025 |
| Golden snapshot churn | Assert outcomes separately from trace snapshots |
| A rule fires against content no pack ships, so it is never exercised | `damage.vulnerability` fires only on a bludgeoning weapon and a vulnerable creature, which is why ADR-0025 added the mace and the skeleton rather than the rule alone |
