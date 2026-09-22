# ADR-0024: A fixture is an actor or an item; there is no `effect` fixture

- Status: accepted
- Date: 2026-09-22
- Closes Q23

## Context

Q23. Two documents disagree. `architecture.md`'s data model gives the `fixtures` table
`kind (actor/item/effect)` — a line no ADR ever stood behind — while
`content-authoring.md` § Fixture says flatly "`kind` is `actor` or `item`". Nothing
anywhere says what an `effect` fixture's `data` would hold.

`FixtureKind` in `schema/fixture.ts` has always been the two, with a comment saying it stays
that way until the documents agree, and `test/schema/fixture.test.ts` pins `kind: 'effect'`
as a parse error. So the code already made a choice; the contradiction is only on paper.

It blocks M3, because "Drizzle schema and migrations for every table in `architecture.md`"
cannot be met while one column's enum has a member nobody can describe.

## Options

1. **Specify the `effect` kind.** Decide what a standalone, seeded, citable effect holds and
   add `EffectFixtureData`.
   - Pros: honours the table as written; a library of reusable effects sounds useful.
   - Cons: nothing needs it. An effect is authored inside a rule's `effects:` list, where it
     is meaningful because the rule supplies its target, its condition and its citation.
     Pulled out on its own it has no slug anyone would reference, no citation of its own —
     the citation belongs to the rule that applies it — and no place in a `Situation`, which
     carries actors and items and nothing else (ADR-0017). A template's `fixture` param is a
     picker over a fixture list, and there is no form an author would pick an effect in.
     It would be a table with no readers, specified to justify a word in a column.

2. **Drop the kind (recommended).** Correct `architecture.md` to `actor`/`item`.
   - Pros: makes the three documents and the code say one thing; unblocks M3's `fixtures`
     table; deletes an unimplementable obligation rather than inventing work to honour it.
   - Cons: if a reusable effect library is ever wanted, it needs a new ADR — which is the
     right place for it, with a use behind it.

## Decision

Option 2. A fixture is an `actor` or an `item`. `architecture.md`'s `fixtures` row becomes
`kind (actor/item)`, `FixtureKind` stays as it is, and the comment in `schema/fixture.ts`
stops deferring to a question and states the reason.

Effects remain authored inside rules. Should a reusable effect ever be wanted, it is a new
kind of content with its own ADR, not a third value smuggled into this enum.

## Consequences

- No behaviour changes and no schema version moves: `FixtureKind` was already the two, so
  this is the documents catching up with the code.
- M3's "Drizzle schema for every table in `architecture.md`" becomes checkable: the
  `fixtures.kind` column is `actor | item`.
- `test/schema/fixture.test.ts`'s rejection of `kind: 'effect'` stops being a note about an
  open question and becomes the test of a decision.
- The template `fixture` param (`schema/template.ts`) is typed by `FixtureKind`, so the UI's
  picker has exactly two lists to draw from and never has to handle a third.
