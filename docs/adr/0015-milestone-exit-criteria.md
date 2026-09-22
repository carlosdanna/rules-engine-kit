# ADR-0015: Milestone exit criteria

- Status: accepted
- Date: 2026-09-22

## Context

Q12. `docs/open-questions.md` marks questions as blocking M2, M3 or M4, and `README.md` tells a
reader that `pnpm db:reset` "arrives in M3" — but no document says what those milestones contain or
when one is finished. "Blocks M2" is therefore unfalsifiable: nothing can be checked against it, and
a question can sit in the table indefinitely because the milestone it blocks has no start.

The engine core is finished and nothing else is started, so this is the last moment the milestone
boundaries can be written down from evidence rather than from memory.

## Options

1. **Leave milestones informal.** Treat M1–M4 as loose labels for phases of work.
   - Pros: no document to maintain; no risk of committing to a shape of work not yet understood.
   - Cons: `open-questions.md`'s "Blocks" column means nothing, and "is this done?" stays a
     judgement call rather than a check — which is exactly what `CLAUDE.md` forbids by requiring
     `pnpm check` before a task is called done.

2. **A separate `docs/milestones.md` with a plan per milestone.**
   - Pros: room for sequencing, estimates and notes.
   - Cons: a fifth document in `CLAUDE.md`'s read-before-working list, and a plan rots faster than
     a definition of done. The list of what is built is already `requirements.md`; a second document
     restating it in milestone order is drift bait.

3. **Exit criteria only, as a section of `requirements.md` (recommended).** Each milestone gets a
   scope line and a list of criteria, every criterion a command that can be run or a named test that
   can pass.
   - Pros: lives beside the FR/VR ids the criteria reference; adds no document; answers "is M2 done?"
     without a judgement call.
   - Cons: says nothing about order or effort — deliberately, that is what a plan is for.

## Decision

Option 3. `docs/requirements.md` gains a `## Milestones` section. A milestone is finished when every
criterion listed for it passes; criteria may be added to a milestone as work reveals them, but the
recorded exit condition is what "done" means.

- **M1 — Engine core.** `pnpm check` green; the golden attack and Bless scenarios; property tests for
  stacking, roll-mode cancelling and rule ordering; `explain()` answering by lookup over a stored
  trace (FR-15); no `fs`, `Date.now()` or `Math.random()` anywhere in `packages/engine` (NFR-1).
- **M2 — Content, templates and diff.** `content/` holds the SRD 5.1 base, the 5.2.1 base and the
  house-rule layer with their fact registries; `pnpm content:lint` green; `renderTemplate`,
  `diffOutcomes` and `diffTraces` implemented; a golden test for every template × profile (NFR-4);
  all five acceptance scenarios in `requirements.md` produce their stated outcomes under both
  editions.
- **M3 — Persistence.** Drizzle schema and migrations for every table in `architecture.md`;
  `pnpm db:reset` rebuilds the seeded rows from `content/` and `scenarios/` and leaves user rows
  alone (ADR-0004); a stored evaluation carries all four VR-7 fields; `db:reset --hard` observably
  differs from `db:reset`.
- **M4 — Web.** Every route in `architecture.md` reachable; the trace viewer renders a stored trace
  as narrative and as JSON (NFR-7); `/compare` shows an aligned diff of two profiles (FR-16);
  scenarios can be created all three ways (FR-18); `/credits` renders from the `sources` table
  (NFR-6).

## Consequences

- `open-questions.md`'s "Blocks" column becomes checkable: a question blocks a milestone when a
  criterion cannot be met without answering it.
- M1 is not finished at the time of writing: ADR-0019's schema corrections are M1 work, because they
  change the engine's output shape and M2's golden tests would otherwise be written against a shape
  that is about to move.
- The criteria reference requirement ids, so a changed requirement is visible as a changed criterion.
- Nothing here fixes an order or a date. Sequencing stays in the plan for the task at hand.
