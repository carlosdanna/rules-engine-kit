# Open questions & risks

Decisions still to make. When one is settled, write an ADR in `docs/adr/` and remove it from here.

## Open questions

Numbers are stable; a settled question keeps its number in the ADR that closed it.

There are none. Q24, the last one, was settled by ADR-0026 while the starter templates and
`renderTemplate` were written; the three checks it recorded as owed are now performed by
`pnpm content:lint`.

Q22, Q23 and Q25 were found while closing Q7–Q20 and while writing the SRD packs; ADR-0026
settled two more that only became visible once there was a template to write, and recorded
them with Q24. All are listed below.

ADR-0031 was written during M4 for five more: a user profile's identity, saving one with
conflicts, deleting one, what a reseed does to one, and whether a comparison is stored.

ADR-0030 was written during M4 for three more: where the app gets a runnable profile, what a
replay runs, and what deleting a scenario with runs does.

ADR-0029 was written during M4 for four more: how a user scenario's slug is minted, what a
duplicate keeps, what an export emits, and how the app writes at all.

ADR-0027 and ADR-0028 were written during M3 for three gaps no question had been raised for:
what a seeded row's primary key is, what `content_hash` is taken over, and what a file in
`scenarios/` is. `scenarios/` now exists — rendering the six starter templates was the obvious
way to populate it, and was work not yet done rather than a question.

Settled: Q1–Q6 by ADR-0005 to ADR-0010, Q13–Q15 by ADR-0011 to ADR-0013 (2026-09-21),
Q7–Q12 and Q16–Q20 by ADR-0015 to ADR-0019, Q21 by ADR-0021, Q22 by ADR-0023, Q23 by
ADR-0024, Q25 by ADR-0025 and Q24 by ADR-0026 (2026-09-22). ADR-0022 was written the same day
for a gap no question had been raised for: a nullable field the situation schema carries on
purpose could not be read by a rule at all.
ADR-0011 supersedes ADR-0008, ADR-0012 supersedes ADR-0007, ADR-0014 supersedes ADR-0010,
ADR-0013 amends ADR-0001, ADR-0011 amends ADR-0005, ADR-0019 amends ADR-0014, and ADR-0025
amends ADR-0011.

Q7 and Q11 were closed as **won't-do**: VR-5 and VR-6 are out of scope for this demo (ADR-0016).
ADR-0024 closed Q23 the same way, by deleting the obligation rather than meeting it: the
`effect` fixture kind is gone from `architecture.md` instead of being specified.

## Known defects

Not questions — things that are wrong and cheap to fix, recorded where the next person will
look rather than fixed mid-task.

- `rulesets.name` is last-pack-wins. `rowsFromContent` keys the `rulesets` rows by `pack.id`
  in a `Map`, so the row for `dnd5e-srd` carries the name of whichever edition was seeded
  last — currently `SRD 5.2.1`, for both 5.1.0 and 5.2.1. Nothing reads it yet: `/rulesets`
  and `/rulesets/[slug]/[version]` display `sources.name`, which is per-edition by
  construction (ADR-0027). A ruleset slug spans editions, so the honest fix is probably to
  drop the column rather than to pick a winner.

- **Saved user scenarios cannot be migrated (VR-8).** `scenarios.schema_version` is stored and
  compared, but nothing migrates a row across a `SITUATION_SCHEMA_VERSION` bump. Until something
  does, such a row is shown and exported as stored and refused by `/scenarios/[slug]/edit`
  (ADR-0029). Not a question — the requirement is clear — but work not yet done.

- **A pack rebuilt from rows does not reproduce `content_hash`.** `rules` has no position
  column, so `rulesetVersionFromRows` reads entries back in `rule_key` order rather than authored
  order. The resolved profile hash is unaffected — `resolveProfile` sorts — and that is the hash
  a run records, so nothing depends on it yet (ADR-0030).

## Top risks

| Risk | Mitigation |
| --- | --- |
| Rule model can't express durations and stacking cleanly | Spiked 2026-09-21 (`docs/spike-notes.md`): the shapes hold; ADR-0007's durations and ADR-0008's roll order were wrong in detail and are superseded by ADR-0012 and ADR-0011 |
| Schema drift across templates, fixtures, scenarios, golden tests | One Zod schema with `schemaVersion`; `content:lint` renders every template with its defaults under every profile it suggests (ADR-0026) |
| Rules silently never fire (JSON Logic missing vars → null) | Fact registry; lint and trace flag unknown facts. Not covered by the spike — `json-logic-js` cannot report facts read or the failing sub-expression, so ADR-0013 replaces it with our own evaluator |
| A registered fact a situation never declares throws rather than defaulting | Sharper in theory than in practice, and worth recording accurately: an `intents.*` path a situation does not declare resolves to `null` rather than throwing (`src/evaluator/facts.ts`), so `{ "==": [{ "var": "intents.useInspiration" }, true] }` reads false and the rule is skipped. Every actor- and action-scoped path still throws as ADR-0013 says. `content:lint` renders every template and warns where a `dieSelector: intent` has no declared choice behind it (ADR-0026) |
| Non-SRD content slips into the public repo | Citation required on every rule/fixture |
| Hand-encoding takes longer than planned | Core-subset table is the scope contract; every row of it is authorable since ADR-0025 |
| Golden snapshot churn | Assert outcomes separately from trace snapshots |
| A rule fires against content no pack ships, so it is never exercised | `damage.vulnerability` fires only on a bludgeoning weapon and a vulnerable creature, which is why ADR-0025 added the mace and the skeleton rather than the rule alone |
