# Rules Engine Kit

A localhost-only demo of a **deterministic, explainable, versioned rules engine**. Give it a
situation and an ordered stack of ruleset versions; it resolves the stack into a single profile,
evaluates the rules in fixed phases, and returns an outcome together with a trace of every rule it
considered, fired or skipped — including the facts each rule read.

The engine is the product. 5E-compatible content from SRD 5.1 and SRD 5.2.1 is the example data it
runs on, which is also what makes the versioning interesting: the same situation resolved under two
editions gives two different, fully explained answers.

## What the demo shows

- **Two editions, one situation.** The home page runs the five acceptance scenarios from
  [`docs/requirements.md`](docs/requirements.md) under both profiles with one click each —
  surprise, inspiration, "Use an Object" vs Utilize, weapon mastery, and a house flanking rule
  on either base — and `/compare` lines the two traces up rule by rule.
- **Layered, versioned rulesets.** A profile is an ordered stack: an SRD base plus layers that
  add, override, patch or disable rules by key. `/profiles` builds one and shows the resolved
  rule list and its hash; `/rulesets` browses each version and diffs two of them.
- **Explainable runs.** Every rule the engine considered, fired or skipped is in the trace,
  with the facts it read. `/evaluations/[id]` shows it as a tree and as narrative text,
  exports it as JSON, and answers "why" and "why not" from the stored trace.
- **Deterministic replay.** A run stores the seed, profile hash and engine version, so
  replaying it gives the same outcome, or tells you what changed.
- **Scenarios you make.** Start from a template's generated form (with a live preview
  rendered in the browser), from a blank slate, or by duplicating one, then run it in
  `/playground`.

## Screenshots

<!-- TODO: capture these from `pnpm dev` after `pnpm db:reset`. -->

| | |
| --- | --- |
| ![Home page with the acceptance scenarios](docs/screenshots/home.png) | ![Compare: surprise under SRD 5.1 and SRD 5.2.1](docs/screenshots/compare.png) |
| ![A stored evaluation's trace as narrative](docs/screenshots/evaluation.png) | ![The profile builder](docs/screenshots/profiles.png) |

## Requirements

- Node.js 22.12+ (developed on 24)
- pnpm 11 (`corepack enable pnpm`)

## Local setup

```sh
pnpm i
pnpm db:reset   # builds data/app.db and seeds it from content/ and scenarios/
pnpm dev
```

`pnpm dev` serves the app on <http://localhost:3000>. Nothing is hosted; there is no deployment.
For the end-to-end suite, install a browser once with `pnpm --filter @rules-engine-kit/web exec
playwright install chromium`.

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | Runs the Next.js app on localhost |
| `pnpm engine run --packs <dirs> --situation <file> --seed <s>` | Evaluates a situation from the terminal; `--forced <file>` pins dice, `--narrative` prints prose |
| `pnpm test` | Vitest in every package, including the golden cases |
| `pnpm test:e2e` | Playwright against a production build, on its own `data/e2e.db` |
| `pnpm typecheck` | `tsc --noEmit` in every package |
| `pnpm lint` | Biome check (lint + format) across the workspace |
| `pnpm format` | Biome, writing fixes |
| `pnpm content:lint` | Checks `content/`: unknown facts, duplicate keys, citations, template renders (FR-17, NFR-6) |
| `pnpm credits:deps` | Regenerates the Runtime table in `CREDITS.md` from the installed dependencies; `--check` only compares |
| `pnpm check` | Lint, typecheck, content lint, credits check and tests — must pass before a change is done |
| `pnpm db:migrate` | Applies the committed migrations to `data/app.db` |
| `pnpm db:seed` | Migrates, then rebuilds the seeded rows from `content/` and `scenarios/` |
| `pnpm db:reset` | The same, without refusing a changed pack version (ADR-0027) |
| `pnpm db:reset --hard` | Deletes every row first, including the ones you made |

`db:seed` and `db:reset` only touch seeded rows; scenarios, profiles and evaluations you
created survive both (ADR-0004). `DATABASE_URL` overrides the database path.

## Layout

```text
apps/web/            Next.js App Router UI (shadcn/ui + Tailwind)
packages/engine/     pure TS engine: no I/O, no clock, no global randomness
packages/db/         Drizzle schema, migrations, seeds, content loader
content/             YAML rule packs, fixtures, templates (source of truth for seeds)
scenarios/           ready-made demo situations
docs/                requirements, architecture, authoring guide, ADRs
```

Dependencies flow one way: `apps/web → packages/db → packages/engine`. Workspace packages are
consumed straight from their TypeScript sources, so there is no build step between them.

## Docs

- [`docs/requirements.md`](docs/requirements.md) — what the engine must do
- [`docs/architecture.md`](docs/architecture.md) — layout, data model, engine modules, routes
- [`docs/content-authoring.md`](docs/content-authoring.md) — rule pack, fixture and template formats
- [`docs/adr/`](docs/adr) — decisions already made
- [`docs/open-questions.md`](docs/open-questions.md) — decisions still open, and known defects
- [`CREDITS.md`](CREDITS.md) — content sources, attribution and software licences

## Licence and attribution

Code is MIT ([`LICENSE`](LICENSE)). Game content is derived from SRD 5.1 and SRD 5.2.1 under
CC BY 4.0 — see [`CREDITS.md`](CREDITS.md). Contributions must follow the SRD-only content rule in
[`CONTRIBUTING.md`](CONTRIBUTING.md).
