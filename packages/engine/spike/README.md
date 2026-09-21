# spike/ — throwaway

Answers the ADR risk "rule model can't express durations and stacking cleanly"
(`docs/open-questions.md`) by modelling the three hardest rules end to end before
any of `packages/engine/src` is written. **Findings live in `docs/spike-notes.md`.**

Not production code: no Zod, no JSON Logic, no fact registry, conditions are TS
predicates, error handling is absent, names are provisional.

Excluded from the build, but **not** from the quality gate:

- `packages/engine/tsconfig.json` `include` is `["src", "test", "vitest.config.ts"]`, so the
  package typecheck ignores this folder; `spike/tsconfig.json` typechecks it separately
- `packages/engine/vitest.config.ts` `include` is `["test/**/*.test.ts"]`, so `pnpm test` skips it
- `pnpm lint` **does** cover it, like every other file in the repo

Run it:

```sh
pnpm --filter @rules-engine-kit/engine exec vitest run --config spike/vitest.config.ts
# typecheck:
pnpm --filter @rules-engine-kit/engine exec tsc --noEmit -p spike/tsconfig.json
# narrative trace rendering:
pnpm --filter @rules-engine-kit/engine exec vitest run --config spike/vitest.config.ts \
  narrate --disable-console-intercept
```

| File | What |
| --- | --- |
| `model.ts` | cut-down types from ADR-0005..0010, with the gaps marked `SPIKE FINDING` |
| `rng.ts` | mulberry32 seeded roller + forced rolls keyed by roll id |
| `engine.ts` | phase loop, roll channels, stacking, duration/expiry resolution |
| `content.ts` | SRD 5.1 and 5.2.1 rule packs plus a house flanking layer |
| `scenarios.test.ts` | the three scenarios, expectations hand-derived from the SRD |
| `narrate.test.ts` | prints a trace as prose, to see what the events can carry |
| `dice-lib-probe.mjs` | the `@dice-roller/rpg-dice-roller` probe (run outside the workspace) |

Delete the whole folder once M1 lands.
