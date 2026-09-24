# ADR-0030: The app evaluates from the database, and a stored run carries its situation

- Status: accepted
- Date: 2026-09-23

## Context

M4's `/playground` runs a saved scenario under a profile and seed and stores the result (VR-7);
`/evaluations/[id]` shows a stored run and replays it. Building them found three gaps that no
ADR or open question had covered:

1. **The database cannot run a profile.** `evaluate` needs a `ResolvedProfile` and the pack's
   fact registry (`opts.facts`). `profiles` stores only a hash, `rules` stores the authored
   entries, and `facts.yaml` was never seeded at all. The only fact merge was private to
   `packages/engine/cli.ts`.
2. **A stored run cannot be replayed faithfully.** `evaluations` stores `scenario_id` but not
   the situation, and user scenarios are editable (ADR-0029). After an edit, a replay would run
   different input from the run it claims to reproduce, and nothing could tell.
3. **A scenario with runs cannot be deleted.** `evaluations.scenario_id` is a foreign key with
   `foreign_keys = ON`, so `deleteUserScenario` would fail with a bare constraint error.

## Options

1. **Profile source.** (a) Rebuild from the rows, adding `ruleset_versions.facts`. (b) Read
   `content/` from disk in the server action.
2. **Replay input.** (a) Add `evaluations.situation`. (b) Replay the scenario's current
   situation and warn that it may have changed.
3. **Deleting a scenario with runs.** (a) Refuse, naming the count. (b) Cascade.

## Decision

1(a), 2(a) and 3(a).

- **A run's profile is rebuilt from the database.** `ruleset_versions.facts` holds each pack's
  registry, written by the seed. `packages/db/src/profile.ts` has `rulesetVersionFromRows`, the
  inverse of `ruleRow`, and `loadResolvedProfile`, which resolves a profile's layers in position
  order and merges their facts with `mergeFacts`. `mergeFacts` moved from `cli.ts` into
  `packages/engine/src/content/`, so the CLI and the app share one merge. Reading `content/`
  instead would let a run use content that differs from what the surrounding pages display, and
  a profile a user builds on `/profiles` exists only as rows.
- **A run is refused when the rebuilt hash is not `profiles.resolved_hash`.** The hash is what
  the row records (VR-7), and a run stored under a hash its rows do not produce is evidence of
  nothing. The remedy named is `pnpm db:reset`. A version whose registry is empty — the
  migration's default, before the next seed — is refused the same way.
- **`evaluations.situation` is the situation as run.** Replay evaluates it with the stored
  `profile_id` and seed, so an edit to the scenario since cannot pass for an engine change. It
  also lets `/evaluations/[id]` narrate with actor names from the row alone. Migration 0001
  backfills existing rows from their scenario, which is exact unless the scenario was edited.
- **A replay is not stored.** It answers "does the current engine reproduce this run?", and the
  answer is a comparison, with two flags: `engine_version` differs from `ENGINE_VERSION`, and
  the profile now resolves to a different hash. The page labels both before anything else.
- **`deleteUserScenario` refuses a scenario that has stored runs** and says how many. Runs are
  evidence; deleting them as a side effect of tidying scenarios would be a surprise.

## Consequences

- Rules are read back in `rule_key` order. `rules` has no position column, so a pack rebuilt from
  rows does not reproduce `content_hash`, although the resolved hash — which is what a run
  records — is unaffected. `packages/db/test/profile.test.ts` holds every seeded profile to its
  seeded hash, and runs a scenario from rows and from files to the same result.
- `diffOutcomes` and `diffTraces` (FR-16) are not built yet, so replay reports whether the two
  runs are identical and names the first trace event that diverges, not a diff.
- A user scenario with runs cannot be deleted from the app. There is no way to delete a run
  yet; `pnpm db:reset --hard` removes them all.
- The playground runs saved scenarios only. A run stores a `scenario_id`, so editing a situation
  in place would first need somewhere to save it.
