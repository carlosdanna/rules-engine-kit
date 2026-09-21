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
  src/time/          rounds/turns, duration ticking
  src/evaluator/     phase loop
  src/dice/          seeded dice, forced results
  src/trace/         events + narrative renderer
  src/diff/          profile and outcome diffs
  src/templates/     render template + params + fixtures → situation
  test/golden/       situation + profile + seed → expected outcome
packages/db/         Drizzle schema, migrations, seed, content loader
content/             rule packs, fixtures, templates (YAML)
scenarios/           ready-made situations
docs/                requirements, architecture, authoring, ADRs
```

Dependency direction: `apps/web → packages/db → packages/engine`. The engine never imports the others.

## Engine API

```ts
resolveProfile(layers: RulesetVersion[]): ResolvedProfile   // { rules, hash, sources, conflicts }
evaluate(situation: Situation, profile: ResolvedProfile, opts: { seed: string; forcedRolls?: number[] }): Outcome
renderTemplate(template: Template, params: unknown, fixtures: FixtureIndex): Situation
explain(outcome: Outcome, ruleKey: string): Explanation
diffOutcomes(a: Outcome, b: Outcome): OutcomeDiff
```

## Evaluation loop

1. Validate situation.
2. For each phase in order: select rules for the phase, sort by priority then `rule_key`.
3. For each rule: evaluate condition (recording facts read) → if true apply effects through the registry → record trace event.
4. Stacking policies combine modifiers before the `roll` phase consumes them.
5. `expire` phase ticks durations and removes expired effects/conditions.
6. Return outcome: final state, derived values, events, seed, profile hash, engine and trace schema versions.

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

JSON columns use `text({ mode: 'json' })` typed with Zod-inferred types. `db:seed` and `db:reset` only touch seeded rows; `db:reset --hard` wipes everything.

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
