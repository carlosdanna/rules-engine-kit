# Architecture

## Repo layout

```text
apps/web/            Next.js + shadcn/ui (routes below)
packages/engine/     pure TS engine
  cli.ts             `pnpm engine run`; the only place the package touches fs (ADR-0020)
  src/schema/        Zod types: Situation, Rule, Effect, Outcome, Trace
  src/resolver/      layer merge, compatibility, canonical hash
  src/conditions/    JSON Logic-subset evaluator + fact registry; records facts read
                     with their values and the sub-expression that failed (ADR-0013)
  src/effects/       effect registry and handlers
  src/stacking/      modifier policies
  src/time/          TimePoint ordering, duration anchors, expiry resolution
  src/evaluator/     phase loop
  src/dice/          seeded dice, forced results
  src/trace/         events + narrative renderer
  src/content/       authored YAML shape → schema shape; pure, no parsing or fs
  src/diff/          profile, outcome and trace diffs
  src/templates/     render template + params + fixtures → situation
  test/golden/       one folder per case: situation + profile + seed → expected outcome
packages/db/         Drizzle schema, migrations, seed
  src/schema/        the tables below, one file per group
  src/seed/          content → rows, the rebuild, and VR-1's content-hash guard
  src/bin/db.ts      `pnpm db:migrate`, `db:seed`, `db:reset [--hard]`
  src/client.ts      the one place the database is opened (foreign_keys, WAL)
  src/content/       reads content/ off a disk: YAML → the documents the lint and the
                     seeds take. `pnpm content:lint` is its bin (FR-17, NFR-6)
  drizzle/           generated migrations, committed
content/             rule packs, fixtures, templates, profiles.yaml (YAML)
scenarios/           ready-made situations: a template call, or a literal one (ADR-0028)
data/app.db          the SQLite file; not committed
docs/                requirements, architecture, authoring, ADRs
```

Dependency direction: `apps/web → packages/db → packages/engine`. The engine never imports the others.

Purity has a boundary inside `packages/engine`, not around it (ADR-0020). `src/` is what the package
publishes and what everything else imports, so it has no I/O, no clock and no global randomness, and
`test/purity.test.ts` fails the build if that stops being true. `cli.ts` and `test/` sit outside it
and read files. `src/content/` decides what an authored shorthand *means* and is pure; `cli.ts` only
supplies the bytes, which is why `packages/db`'s seeder can reuse the same normaliser over rows.

That split is where the content loader lives now. The checks `pnpm content:lint` runs are
`packages/engine/src/content/lintContent`, which takes documents someone else has parsed;
reading a tree off a disk and running them over it is `packages/db/src/content`. `cli.ts`
keeps its own `loadPack`, because the golden harness uses it and `packages/engine` may not
depend on `packages/db` (ADR-0020) — so there are two walkers over one shared core, and
`packages/db/test/content/parity.test.ts` holds them to the same answer.

Decisions behind this shape: ADR-0005 (timeline), ADR-0006 (derived stats), ADR-0012 (time and
durations, superseding ADR-0007), ADR-0011 (effect channels and roll order, superseding
ADR-0008), ADR-0009 (layer precedence), ADR-0014 (trace events, superseding ADR-0010),
ADR-0013 (condition evaluator), ADR-0017 (self-contained situations), ADR-0018 (layers extend
the base only), ADR-0019 (the trace and outcome corrections that closed Q17–Q20), ADR-0021
(effect values read facts), ADR-0023 (damage reports the overflow it discards), ADR-0024 (a
fixture is an actor or an item), ADR-0025 (the damage scale channel, amending ADR-0011) and
ADR-0026 (profiles are named and seeded; a skeleton is Situation-shaped), ADR-0027 (a
seeded row's identity, and the content hash) and ADR-0028 (a scenario file is a template
call).

## Engine API

```ts
resolveProfile(layers: RulesetVersion[]): ResolvedProfile   // { rules, hash, sources, conflicts }
evaluate(
  situation: Situation,                                     // actors + ordered timeline of steps
  profile: ResolvedProfile,
  opts: {
    seed: string;
    forcedRolls?: Record<RollId, number[]>;
    traceLevel?: 'full' | 'fired-only';   // default 'full'
    facts?: FactDefinition[];             // the pack's fact registry; see below
  },
): EvaluationResult                                         // { outcome, trace }
renderTemplate(
  template: Template,
  params: unknown,
  fixtures: FixtureIndex,                                   // (slug, kind, profile) → Fixture
  profileSlug: string,                                      // a slug content/profiles.yaml declares
): Situation                                                // inlines them (ADR-0017, ADR-0026)
explain(trace: Trace, ruleKey: string): Explanation         // lookup only; never re-evaluates
diffOutcomes(a: Outcome, b: Outcome): OutcomeDiff
diffTraces(a: Trace, b: Trace): TraceDiff                   // aligned on (stepId, phase, ruleKey)
diffRulesets(a: RulesetVersion, b: RulesetVersion): RulesetDiff  // authored entries by rule_key (VR-9)
```

Fact definitions reach the engine through `opts.facts`, not through `ResolvedProfile`. The
profile hash is the canonical JSON of the resolved rules plus the layer identities (ADR-0009),
so putting facts on it would change every stored hash (VR-7) for something the merge does not
touch. The engine registers no paths of its own: a pack declares all of them, including the
derived ones, so `content:lint` and the evaluator cannot disagree about what a path means.

A `Situation` is closed over its content (ADR-0017): `renderTemplate` inlines actor *and* item
fixtures, so `situation.items` holds every weapon the timeline names and `action.weapon` is a key
into it rather than a reference to a seeded row. `createFactSource` serves `action.weapon.*` —
`name`, `properties`, `mastery`, and the damage as notation (`damage.dice`) plus `damage.count`
and `damage.sides` — all within the `FactType` vocabulary a pack can register. A saved scenario
therefore replays to the same outcome after a fixture is corrected; re-rendering it from
`scenarios.template_id` and `scenarios.params` is how a correction is taken up deliberately.

`forcedRolls` is keyed by **roll id**, not by step id (ADR-0011): a `RollId` is
`` `${stepId}/${kind}:${actorId}` `` plus a channel suffix for dice that are not the d20 itself
(`:reroll`, or the modifier type for a dice-valued modifier). Each entry supplies that channel's
dice in order — both dice of an advantage pair on the base id, one value per reroll use on
`:reroll`. Keying by step id alone would couple fixtures to the order phases happen to consume
dice in, so adding a rule would silently shift every later forced value. The same ids key
`situation.intents.rollChoices`, so a template can pre-declare which die a reroll touches.

A `Trace` is `{ traceSchemaVersion, events }` — a flat, ordered array of discriminated-union
events, each carrying `(seq, stepId, round, phase)` (ADR-0010, event list revised by ADR-0014).
There is no `phaseStart` event: the phase list is fixed, so the viewer renders all eight headers
and groups events by `(stepId, phase)`.

## Evaluation loop

1. Validate situation, including every step in its timeline.
2. For each step in timeline order, run the phases `upkeep → declare → modifiers → roll → compare → damage → apply → expire`.
3. Per phase: select the enabled rules for that phase, sort by priority then `rule_key`.
4. Per rule: evaluate condition (recording facts read) → if true apply effects through the registry → record a trace event. Rules that were selected but did not fire are recorded too, with the sub-condition that failed.
5. Stacking policies combine numeric modifiers before the `roll` phase consumes them; roll mode
   (advantage/disadvantage cancelling) and roll transforms (rerolls) resolve on their own
   channels, in the order **mode → dice pool → transforms on a chosen die of the pool → keep →
   modifiers** (ADR-0011). Transforms act on the pool, before the keep, because both SRDs let a
   reroll replace only one die of an advantage pair and leave the choice to the player; that
   choice comes from `intents.rollChoices`.
6. `damage` sums its modifiers, then applies the multiplicative scale on its own channel —
   resistance halves (rounding down), then vulnerability doubles, each at most once however many
   rules granted it — and carries the weapon's damage type with the total. `apply` spends it
   against hit points, which clamp at 0; the amount discarded past 0 is reported, never acted on
   (ADR-0025, ADR-0023).
7. `upkeep` removes effects whose resolved `expiresAt` falls on the start of this step; `expire`
   does the same for the end of it. Durations resolve against the whole timeline at application
   time and name an anchor turn and an edge, so `expiresAt` distinguishes a concrete `TimePoint`
   from `permanent` and from `beyondTimeline` (ADR-0012).
8. Return `{ outcome, trace }`: per-step results, final state, derived values with their terms, events, seed, profile hash, engine and trace schema versions.

## Data model (SQLite via Drizzle)

| Table | Owner | Key columns |
| --- | --- | --- |
| `sources` | seed | name, author, url, license, attribution_text |
| `rulesets` | seed | slug, name, kind (`base`/`layer`) |
| `ruleset_versions` | seed | ruleset_id, semver, base_ruleset_id, base_range, content_hash, facts, source_id |
| `rules` | seed | ruleset_version_id, rule_key, op, phase, priority, tags, condition, effects, citation, interpretation |
| `fixtures` | seed | slug, kind (`actor`/`item`), ruleset_scope, data, interpretation, source_id |
| `templates` | seed | slug, name, description, tags, params_schema, skeleton, suggested_profiles, schema_version |
| `profiles` | both | slug, name, resolved_hash, origin (`seed`/`user`). Seeded rows come from `content/profiles.yaml` (ADR-0026) |
| `profile_layers` | both | profile_id, ruleset_version_id, position |
| `scenarios` | both | slug, name, situation, template_id?, params?, origin, schema_version |
| `evaluations` | user | scenario_id, profile_id, profile_hash, seed, engine_version, trace_schema_version, situation, outcome, trace |

`scenarios.situation` holds the whole timeline; `evaluations.trace` holds the flat event array and its `trace_schema_version`. `ruleset_versions.facts` is the pack's fact registry and `evaluations.situation` is the situation as it was run, so the app evaluates and replays from rows alone (ADR-0030). JSON columns use `text({ mode: 'json' })` typed with Zod-inferred types. `db:seed` and `db:reset` only touch seeded rows; `db:reset --hard` wipes everything.

Two things hold across every table, both from ADR-0027. **A seeded row's primary key is a
deterministic text id** derived from the natural key the content already carries —
`dnd5e-srd@5.2.1`, `dnd5e-srd@5.2.1#condition.prone.attacked`, `actor:goblin:srd-5.1`, and the
slug itself for a ruleset, template, profile or scenario. That is what makes reseeding
idempotent rather than merely careful, and what lets a user `evaluation` keep pointing at the
seeded `scenario` it ran after `db:reset` has deleted and rewritten that row. Where the table
above says "slug", the id *is* the slug and there is no second column. And **there are no
timestamp columns**: a clock in a seeded row would make two rebuilds differ for a reason
nothing in `content/` changed.

Two columns moved from where this table first put them, for reasons that only appear once
something is written. `source_id` is on `ruleset_versions` rather than on `rulesets`, because
SRD 5.1 and SRD 5.2.1 are two versions of the one ruleset slug `dnd5e-srd` and share neither
their URL nor their attribution — one `source_id` per slug could hold only one of them, and
`/credits` would attribute one edition to the other. And `base_version_id` is
`base_ruleset_id`, because a layer declares a *range* of compatible base versions (VR-3): the
house rule's `>=5.1.0` matches both seeded SRD versions on purpose (ADR-0018), so there is no
single base version to point at.

`ruleset_versions.content_hash` is `sha256Hex(canonicalJson(pack))` over the normalised
`RulesetVersion`, using the same canonical spelling the profile hash uses (ADR-0009). It is a
different number answering a different question: what was *authored*, not what the merge
*produced*. `db:seed` refuses to re-seed a `(ruleset, semver)` already stored under a different
hash (VR-1); `db:reset` rebuilds instead of comparing, which is what makes it the escape hatch
while content is being written.

## Web routes

| Route | Purpose |
| --- | --- |
| `/` | Overview, quick-run a sample |
| `/scenarios` | List; "New" → blank, from template, duplicate |
| `/scenarios/new?template=…` | Form generated from template params, fixture pickers, JSON preview; `?from=<slug>` duplicates, no param is a blank slate |
| `/scenarios/[slug]`, `/scenarios/[slug]/edit` | One saved scenario, exported as YAML; user rows can be edited and deleted (ADR-0029) |
| `/playground` | Choose a saved scenario (`?scenario=<slug>`), profile + seed, run and store, trace viewer (ADR-0030) |
| `/compare` | One saved scenario, two profiles, one seed (`?scenario&a&b&seed`), side by side + diff; stores nothing (ADR-0031) |
| `/rulesets`, `/rulesets/[slug]/[version]` | Browse rules with citations; a Diff tab against another version (`?tab=diff&against=`, VR-9) |
| `/templates` | Browse templates and fixtures |
| `/profiles` | Order layers, see hash and conflicts; save and delete user profiles (ADR-0031) |
| `/evaluations/[id]` | Stored run, replay on the current engine (not stored), labelled when `engine_version` differs |
| `/credits` | Rendered from `sources`, linked in the footer |
