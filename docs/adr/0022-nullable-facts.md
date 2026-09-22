# ADR-0022: A fact may be declared nullable, and only then may it read null

- Status: accepted
- Date: 2026-09-22

## Context

Found while writing the SRD packs, against a promise `content-authoring.md` already makes.

The situation schema has nullable fields on purpose. An item's `mastery` "is `null` on a
weapon scoped to 5.1, so one fixture can serve both editions and the difference is whether a
rule reads the field" (ADR-0017, restated in `content-authoring.md`); a `check` action's
`skill` is `null` for a plain ability check; an attack's `weapon` is `null` for an unarmed
strike.

A rule cannot read any of them. `readOperand` parses every fact through the type its
registry entry declares, and `FactType` is `number | string | boolean | numberList |
stringList` with no nullable form — so `action.weapon.mastery` reading `null` raises
`FactTypeError` rather than answering "no mastery". The one rule the acceptance scenarios
need it for — SRD 5.2.1's Sap — therefore cannot run against a weapon that has no mastery,
which is every weapon in the other edition. The field was designed to be read and cannot be.

Parsing through the declared type is not the thing to give up: it is what makes `factsRead`
honest and what catches a fact that changed shape (ADR-0013).

## Options

1. **Sentinel values.** The engine serves `''` or `'none'` where the data holds `null`.
   - Pros: no schema change; `action.type` already does this, answering `'none'` for a step
     that takes no action.
   - Cons: `action.type`'s sentinel works because "took no action" is a real answer every
     condition guards on. `mastery: ''` is not an answer, it is `null` spelled so that a
     comparison against it silently succeeds — and a pack could then never distinguish "no
     mastery" from a mastery someone forgot to name.

2. **A nullable flag on the fact definition (recommended).** `facts.yaml` may declare
   `nullable: true`, and only such a fact may read `null`. Everything else is unchanged: an
   unregistered path is still an error, and a non-nullable fact reading `null` is still a
   `FactTypeError`.
   - Pros: the registry keeps saying exactly what a path may return, which is the property
     worth protecting; `Operand` already admits a `null` literal, so `{ "!=": [{ "var":
     "action.weapon.mastery" }, null] }` needs nothing new from the evaluator; a pack that
     forgets the flag fails loudly at the first read rather than quietly.
   - Cons: one more field an author must get right, and a fact declared nullable that never
     is null costs a reader a moment's doubt.

3. **Every fact nullable.** Drop the strictness and let any path answer `null`.
   - Pros: nothing to declare.
   - Cons: gives back exactly what ADR-0013 bought — a rule that silently never fires
     because a path it reads went missing is the failure mode the fact registry exists to
     prevent, and it is in the risk register by name.

## Decision

Option 2. `FactDefinition` gains `nullable: boolean`, defaulting to `false` like `derived`,
and `registryFromFacts` wraps the declared type in `.nullable()` when it is set. Comparisons
are unchanged: `==` and `!=` against a `null` literal already work, and `<`, `in` and the
rest still refuse a `null` operand, because ordering or set-testing an absent value is a
content bug however it was declared.

`loadPacks` treats `nullable` like `derived` when a layer redeclares a path its base
already declared: the same declaration is harmless, a different one is a content bug and
says so.

## Consequences

- SRD 5.2.1's Sap rule reads `action.weapon.mastery` and answers "this weapon has none"
  instead of throwing, which is what made one fixture serve both editions in ADR-0017.
- A pack that wants to read an unarmed attack's weapon fields declares them nullable too.
  The SRD packs here do not: they state in the rules that read a weapon that an attack under
  them carries one, because neither pack encodes unarmed strikes.
- `content:lint` needs no new check. A nullable fact is a declaration, not a mistake, and
  the failure it prevents was already reported at run time.
- No trace or outcome shape changes, so `TRACE_SCHEMA_VERSION` stays at 2.
