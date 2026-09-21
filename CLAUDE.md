# CLAUDE.md

Localhost-only demo of a **versioned rules engine**. Given a situation, the engine resolves a stack of versioned rulesets, evaluates the rules in phases, and returns an outcome plus a full trace. D&D 5e SRD content (5.1 and 5.2.1) is example data, not the product.

## Read before working
- `docs/requirements.md` — what the engine must do (IDs like FR-9, VR-2).
- `docs/architecture.md` — repo layout, data model, engine modules.
- `docs/content-authoring.md` — rule packs, fixtures, templates formats.
- `docs/open-questions.md` — unresolved decisions. If a task depends on one, stop and ask me.
- `docs/adr/` — decisions already made. Don't contradict an accepted ADR; propose a new one instead.

## Stack
pnpm workspace · Next.js (App Router) + shadcn/ui + Tailwind · SQLite via better-sqlite3 · Drizzle ORM + drizzle-kit · Zod · json-logic-js · Vitest · Playwright · TypeScript strict everywhere.

## Layout
- `packages/engine` — pure TS. No imports from Next.js, Drizzle, `fs`, `Date.now()` or `Math.random()`.
- `packages/db` — Drizzle schema, migrations, seed scripts. Depends on engine, never the reverse.
- `apps/web` — Next.js app. DB access only in server code (`server-only`), routes touching SQLite use `runtime = 'nodejs'`.
- `content/` — YAML rule packs, fixtures, templates. Source of truth for seeded data.
- `scenarios/` — ready-made demo situations.

## Commands
- `pnpm dev` — run the app on localhost
- `pnpm test` / `pnpm test -u` — Vitest (update snapshots only when I ask)
- `pnpm typecheck` · `pnpm lint` · `pnpm content:lint`
- `pnpm db:migrate` · `pnpm db:seed` · `pnpm db:reset` (seeded data only) · `pnpm db:reset --hard`
- `pnpm check` — everything; must pass before you say a task is done

## Engine rules
- Evaluation is deterministic: same situation + resolved profile + seed ⇒ same outcome and trace.
- All randomness goes through the injected seeded RNG. Dice can be forced for tests.
- State is immutable; effects return new state.
- Fixed phases only for the PoC. No forward chaining (see ADR-0003).
- Player choices are declared up front in `situation.intents`; evaluation never pauses.
- Every fired, skipped or considered rule produces a trace event with the facts it read.
- Unknown fact paths are errors, not silent `null`s.

## Content & licensing rules (public repo)
- Rules and fixtures come **only** from SRD 5.1 or SRD 5.2.1. Never use text or mechanics from the PHB, DMG, D&D Beyond Basic Rules or your own memory of non-SRD books.
- Paraphrase rules into structured data; don't paste long SRD passages.
- Every rule and fixture needs `citation.source` and `citation.section`. Add an `interpretation` note when wording is ambiguous.
- Don't use D&D logos or trademarks in names, titles or UI. "5E compatible" is fine.
- Keep `CREDITS.md` accurate when adding any source or dependency.

## How to work
- Start each task by restating the goal and listing files you'll touch; wait for my OK on anything spanning more than one package.
- Write tests first for engine code (golden tests in `packages/engine/test/golden`).
- Hand-derive expected outcomes from the SRD text, never from engine output.
- Keep changes scoped to the current milestone; note anything else in `docs/open-questions.md`.
- Use Conventional Commits. Don't commit the SQLite file (`data/*.db`).
