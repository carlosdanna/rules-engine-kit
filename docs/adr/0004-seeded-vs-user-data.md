# ADR-0004: Seeded vs user data

- Status: accepted
- Date: 2026-09-21

## Context
Content lives in git, but the app also creates scenarios, profiles and evaluations.

## Decision
Seeded tables and rows (`origin = 'seed'`) are rebuilt from `content/` and `scenarios/` by `db:seed` / `db:reset`. User rows are never touched by those commands; only `db:reset --hard` wipes them. User scenarios can be exported to YAML and promoted into `scenarios/`.

## Consequences
Git remains the source of truth for content; reseeding is safe during development.
