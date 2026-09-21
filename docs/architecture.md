# Architecture

## Repo layout

```text
apps/web/            Next.js + shadcn/ui (routes below)
packages/engine/     pure TS engine
  src/schema/        Zod types: Situation, Rule, Effect, Outcome, Trace
  src/resolver/      layer merge, compatibility, canonical hash
  src/conditions/    JSON Logic wrapper + fact registry, records facts read
  src/effects/       effect registry and handlers
  src/stacking/      modifier policies
  src/time/          TimePoint ordering, duration anchors, expiry resolution
  src/evaluator/     phase loop
  src/dice/          seeded dice, forced results
  src/trace/         events + narrative renderer
  src/diff/          profile, outcome and trace diffs
  src/templates/     render template + params + fixtures → situation
  test/golden/       situation + profile + seed → expected outcome
packages/db/         Drizzle schema, migrations, seed, content loader
content/             rule packs, fixtures, templates (YAML)
scenarios/           ready-made situations
docs/                requirements, architecture, authoring, ADRs
```

Dependency direction: `apps/web → packages/db → packages/engine`. The engine never imports the others.

Decisions behind this shape: ADR-0005 (timeline), ADR-0006 (derived stats), ADR-0007 (time and durations), ADR-0008 (effect channels), ADR-0009 (layer precedence), ADR-0010 (trace).

## Engine API

```ts
resolveProfile(layers: RulesetVersion[]): ResolvedProfile   // { rules, hash, sources, conflicts }
evaluate(
  situation: Situation,                                     // actors + ordered timeline of steps
  profile: ResolvedProfile,
  opts: { seed: string; forcedRolls?: Record<string, number[]>; traceLevel?: 'full' | 'fired-only' },
): EvaluationResult                                         // { outcome, trace }
renderTemplate(template: Template, params: unknown, fixtures: FixtureIndex): Situation
explain(trace: Trace, ruleKey: string): Explanation         // lookup only; never re-evaluates
diffOutcomes(a: Outcome, b: Outcome): OutcomeDiff
diffTraces(a: Trace, b: Trace): TraceDiff                   // aligned on (stepId, phase, ruleKey)
```

`forcedRolls` is keyed by step id; each entry supplies dice in the order the step consumes them, including both dice of an advantage pair and one value per reroll. A `Trace` is `{ traceSchemaVersion, events }` — a flat, ordered array of discriminated-union events (ADR-0010).

## Evaluation loop

1. Validate situation, including every step in its timeline.
2. For each step in timeline order, run the phases `upkeep → declare → modifiers → roll → compare → damage → apply → expire`.
3. Per phase: select the enabled rules for that phase, sort by priority then `rule_key`.
4. Per rule: evaluate condition (recording facts read) → if true apply effects through the registry → record a trace event. Rules that were selected but did not fire are recorded too, with the sub-condition that failed.
5. Stacking policies combine numeric modifiers before the `roll` phase consumes them; roll mode (advantage/disadvantage cancelling) and roll transforms (rerolls) resolve on their own channels, in the order mode → die → transforms → modifiers.
6. `upkeep` removes effects whose resolved `expiresAt` falls on the start of this step; `expire` does the same for the end of it.
7. Return `{ outcome, trace }`: per-step results, final state, derived values with their terms, events, seed, profile hash, engine and trace schema versions.

## Data model (SQLite via Drizzle)

| Table | Owner | Key columns |
| --- | --- | --- |
| `sources` | seed | name, author, url, license, attribution_text |
| `rulesets` | seed | slug, name, kind (`base`/`layer`), source_id |
| `ruleset_versions` | seed | ruleset_id, semver, base_version_id, base_range, content_hash |
| `rules` | seed | ruleset_version_id, rule_key, op, phase, priority, tags, condition, effects, citation, interpretation |
| `fixtures` | seed | slug, kind (`actor`/`item`/`effect`), ruleset_scope, data, source_id |
| `templates` | seed | slug, name, description, tags, params_schema, skeleton, suggested_profiles, schema_version |
| `profiles` | both | slug, name, resolved_hash, origin (`seed`/`user`) |
| `profile_layers` | both | profile_id, ruleset_version_id, position |
| `scenarios` | both | slug, name, situation, template_id?, params?, origin, schema_version |
| `evaluations` | user | scenario_id, profile_id, profile_hash, seed, engine_version, trace_schema_version, outcome, trace |

`scenarios.situation` holds the whole timeline; `evaluations.trace` holds the flat event array and its `trace_schema_version`. JSON columns use `text({ mode: 'json' })` typed with Zod-inferred types. `db:seed` and `db:reset` only touch seeded rows; `db:reset --hard` wipes everything.

## Web routes

| Route | Purpose |
| --- | --- |
| `/` | Overview, quick-run a sample |
| `/scenarios` | List; "New" → blank, from template, duplicate |
| `/scenarios/new?template=…` | Form generated from template params, fixture pickers, JSON preview |
| `/playground` | Edit situation, choose profile + seed, run, trace viewer |
| `/compare` | One situation, two profiles, side by side + diff |
| `/rulesets`, `/rulesets/[slug]/[version]` | Browse rules with citations |
| `/templates` | Browse templates and fixtures |
| `/profiles` | Order layers, see hash and conflicts |
| `/evaluations/[id]` | Stored run, replay |
| `/credits` | Rendered from `sources`, linked in the footer |
