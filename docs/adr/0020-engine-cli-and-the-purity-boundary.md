# ADR-0020: A CLI in `packages/engine`, and where the purity boundary runs

- Status: accepted
- Date: 2026-09-22

## Context

Two things arrived together and turn out to be one decision.

The golden tests written during M1 are bespoke TypeScript: `test/golden/attack-vs-prone.test.ts`
hand-builds a situation, imports rule packs from `test/golden/packs.ts` and asserts on the result.
That is fine for two scenarios. NFR-4 asks for "a golden test for every template × profile" in M2,
where there will be many, and a file of code per case does not survive that. A case wants to be
data: a folder holding a situation, a profile, a seed and the outcome someone derived by hand.

But a profile in a folder is a list of *pack paths*, and nothing in this repository can load a pack
from a path. `content/` is unwritten, no package depends on a YAML parser, and
`docs/content-authoring.md` describes an authored shape the Zod schemas do not accept —
`value: { dice: 1d4 }` where `DiceExpr` wants `{ count, sides }`, a bare `dieSelector: intent` for a
tagged union, `anchor: source` for an `AnchorRef`, and rules that omit `label` and `tags` although
`Rule` requires both. `src/schema/index.ts` already promises that "its loader normalises the
authoring shorthands"; there is no loader. So the harness needs one, and once a loader exists,
running a situation from a terminal is a few lines more — which is worth having on its own, because
a demo whose engine can only be driven by a test file is hard to show.

The obstacle is where that code may live. ADR-0002 says `packages/engine` has no I/O, and ADR-0015
made it an M1 exit criterion in those words: "no `fs`, `Date.now()` or `Math.random()` **anywhere in
`packages/engine`**". A loader reads files. Read literally, the criterion puts the loader in
`packages/db`, which `architecture.md` names as the home of the content loader — but `packages/db`
depends on the engine and the engine may never depend on it, so the engine's own golden tests could
not use it. The alternative reading of the criterion is that it never meant the package, it meant
the part of the package that gets imported.

## Options

1. **Loader and CLI in a new `packages/cli`.** The engine package stays literally free of `fs`.
   - Pros: no ADR amendment; the criterion stands as written.
   - Cons: a fourth workspace package, its own `package.json`, `tsconfig` and scripts, for one file.
     And it does not actually solve the problem it was chosen for: `test/golden/` still needs the
     loader, so the engine's tests would import a package that imports the engine, which is the
     dependency inversion ADR-0002 is trying to prevent — now with a cycle through the test tree.

2. **Loader in `packages/db`, as `architecture.md` says.** Put it where the layout diagram already
   puts it.
   - Pros: no new package, no ADR.
   - Cons: same fatal flaw, less disguised. `packages/db → packages/engine` is the declared
     direction; the engine's golden tests cannot reach back across it. The loader would have to be
     written twice or the golden harness would have to stop being data.

3. **Keep both in `packages/engine`, outside `src/` (recommended).** `cli.ts` sits beside `src/`
   and `test/`, and the purity boundary is restated as `packages/engine/src`.
   - Pros: one loader, used by the CLI and by the golden harness, so there is a single answer to
     what a pack's YAML means — which is the whole point of a golden case. No new package. The
     property that actually matters is preserved exactly: `src/` is what `packages/engine`'s
     `exports` field publishes and what every consumer imports, so it stays pure, and NFR-3's
     "runs in a browser" is unaffected because nothing under `src/` imports `cli.ts`.
   - Cons: the criterion's wording has to change, and "no `fs` in the engine" becomes a sentence
     with a caveat in it — which is a real cost, since a rule people can recite is worth more than
     a rule people have to look up.

## Decision

Option 3.

- `packages/engine/cli.ts` exists and may use `fs`. It exports `loadPack` and `loadPacks`, which
  `test/golden/harness.ts` uses, so the CLI and the golden cases load packs identically.
- The pure→impure boundary is **`packages/engine/src`**, not the package. `src/` has no I/O, no
  clock, no global randomness and no framework imports; `cli.ts` and `test/` are outside it.
- The authoring-shape normaliser is pure and lives in `src/content/`, because deciding what
  `dieSelector: intent` means is engine knowledge and should be testable without a filesystem.
  Only reading bytes off a disk is outside.
- `packages/engine/test/purity.test.ts` enforces the boundary by scanning `src/`. The criterion
  stops being a claim and becomes something `pnpm check` fails on.
- ADR-0015's M1 criterion is reworded to `packages/engine/src`. ADR-0002's decision is unchanged in
  substance and now names the boundary it always meant.

## Consequences

- `architecture.md` no longer describes the only content loader. `packages/db` will still need one
  for seeding (M3) and should call the same `normalizePack`, differing only in where the bytes come
  from — a database row rather than a file.
- The `content/` format now has executable coverage before `content/` exists. Every shorthand in
  `content-authoring.md` is a test in `test/content/normalize.test.ts`, so M2 starts against a
  loader that is known to accept what the document tells an author to write, rather than
  discovering the gap one rule at a time.
- `tsx` becomes a root dev dependency. The engine ships untranspiled TypeScript with
  extensionless relative imports under `bundler` resolution, which Node's own type stripping cannot
  resolve, so running `cli.ts` needs a loader that can.
- The purity test is a text scan, not a semantic one. It will not catch `globalThis['Ma' + 'th']`,
  and it is not meant to; it catches the accident, which is the failure mode that actually happens.
- A second boundary now has to be remembered: `src/` is published and pure, the package is neither.
  The mitigation is that the test says so out loud and fails on the mistake.
