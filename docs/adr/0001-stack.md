# ADR-0001: Stack

- Status: accepted
- Date: 2026-09-21

## Context
Localhost-only demo; developer is fluent in TypeScript/React/Next.js. Needs a DB with seeds and an ORM, no hosting.

## Decision
pnpm workspace; Next.js (App Router) + shadcn/ui + Tailwind; SQLite via better-sqlite3; Drizzle ORM + drizzle-kit for schema, migrations and seeds; Zod for validation; json-logic-js for conditions; Vitest and Playwright for tests. Git repo is public with no CI; quality checks run through `pnpm check` and git hooks.

## Consequences
Single-file DB rebuilt from YAML content. Native SQLite driver means DB code must run in Node server code only.
