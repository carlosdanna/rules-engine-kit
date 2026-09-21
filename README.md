# Rules Engine Kit

A localhost-only demo of a **deterministic, explainable, versioned rules engine**. Give it a
situation and an ordered stack of ruleset versions; it resolves the stack into a single profile,
evaluates the rules in fixed phases, and returns an outcome together with a trace of every rule it
considered, fired or skipped — including the facts each rule read.

The engine is the product. 5E-compatible content from SRD 5.1 and SRD 5.2.1 is the example data it
runs on, which is also what makes the versioning interesting: the same situation resolved under two
editions gives two different, fully explained answers.

## Requirements

- Node.js 22.12+ (developed on 24)
- pnpm 11 (`corepack enable pnpm`)

## Local setup

```sh
pnpm i
pnpm db:reset   # seeds the SQLite database — arrives in M3, skip it until then
pnpm dev
```

`pnpm dev` serves the app on <http://localhost:3000>. Nothing is hosted; there is no deployment.

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | Runs the Next.js app on localhost |
| `pnpm test` | Vitest in every package |
| `pnpm typecheck` | `tsc --noEmit` in every package |
| `pnpm lint` | Biome check (lint + format) across the workspace |
| `pnpm format` | Biome, writing fixes |
| `pnpm check` | Lint, typecheck and test — must pass before a change is done |

Database and content scripts (`pnpm db:migrate`, `pnpm db:seed`, `pnpm db:reset`,
`pnpm content:lint`) land with the packages that own them; see `docs/architecture.md`.

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
- [`docs/open-questions.md`](docs/open-questions.md) — decisions still open

## Licence and attribution

Code is MIT ([`LICENSE`](LICENSE)). Game content is derived from SRD 5.1 and SRD 5.2.1 under
CC BY 4.0 — see [`CREDITS.md`](CREDITS.md). Contributions must follow the SRD-only content rule in
[`CONTRIBUTING.md`](CONTRIBUTING.md).
