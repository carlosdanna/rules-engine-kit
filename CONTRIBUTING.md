# Contributing

## Before you open a PR

There is no CI. The checks run on your machine:

```sh
pnpm check   # lint + typecheck + test
```

A PR is ready when `pnpm check` passes. Git hooks (lefthook, installed by `pnpm i`) give you an
earlier signal: `pre-commit` lints the staged files with Biome, `pre-push` runs the typecheck and
the test suite.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `chore:`,
`refactor:`, `test:`. Scope with the package when it helps — `feat(engine): …`.

Never commit the SQLite database (`data/*.db`); it is rebuilt from `content/` with `pnpm db:reset`.

## UI components

`pnpm dlx shadcn@latest add <component>` writes into `apps/web/components/ui/` in shadcn's own
formatting style. Run `pnpm format` afterwards so Biome brings it in line with the rest of the
workspace, otherwise the pre-commit hook will reject it.

## Content rule: SRD only

This repository is public, so game content has exactly one allowed provenance:

- Rules and fixtures come **only** from SRD 5.1 or SRD 5.2.1. Not the PHB, not the DMG, not the
  D&D Beyond Basic Rules, not memory of a non-SRD book.
- Paraphrase rules into structured data; don't paste long SRD passages.
- Every rule and fixture carries `citation.source` and `citation.section`. Add an `interpretation`
  note where the wording is ambiguous and you had to decide.
- No D&D logos or trademarks in names, titles or UI. "5E compatible" is fine.
- Keep [`CREDITS.md`](CREDITS.md) accurate whenever you add a source or a dependency.

See [`docs/content-authoring.md`](docs/content-authoring.md) for the file formats.

## Engine rules

`packages/engine` is pure (ADR-0002): no imports from Next.js, Drizzle or `fs`, no `Date.now()`, no
`Math.random()`. Randomness comes from the injected seeded RNG, state is immutable, and the same
situation + profile + seed must always produce the same outcome and trace.

Write tests first for engine code; golden tests live in `packages/engine/test/golden`. Hand-derive
expected outcomes from the SRD text, never from the engine's own output.

## Decisions

`docs/adr/` holds accepted decisions. Don't contradict one — propose a new ADR using
[`docs/adr/0000-template.md`](docs/adr/0000-template.md). Unresolved questions belong in
[`docs/open-questions.md`](docs/open-questions.md) rather than in a PR description.
