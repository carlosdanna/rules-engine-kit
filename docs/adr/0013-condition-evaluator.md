# ADR-0013: Own the condition evaluator; keep JSON Logic as the syntax

- Status: accepted
- Date: 2026-09-21
- Amends ADR-0001 (drops the `json-logic-js` dependency)

## Context

Q15. Three accepted requirements all land on the condition evaluator at once:

- **FR-6 / NFR-5** — conditions are authored as JSON Logic in YAML.
- **FR-14** — every rule event records *the facts it read, with their values*.
- **ADR-0010** — a skipped rule reports `{ kind: 'conditionFalse'; failedAt: string }`, a JSON
  pointer into the condition tree, and `explain()` must be a pure lookup so an explanation can never
  disagree with the run it describes.
- **CLAUDE.md / FR-17** — unknown fact paths are errors, not silent `null`s.

`json-logic-js@2.0.5` (named in ADR-0001) gives none of the last three. Reading its source:

- `var` *is* in the operations table, so `add_operation('var', …)` can intercept fact reads — but
  `add_operation` mutates a module-level `operations` object shared by every caller. That is the
  same global-mutable-state objection ADR-0002 raises, and the same one that ruled out the dice
  library in `docs/spike-notes.md` §3.
- `and`, `or` and `if` are hard-coded in `jsonLogic.apply` *ahead of* the operations table
  (`// 'if', 'and', and 'or' violate the normal rule of depth-first calculating consequents`). They
  cannot be replaced at all, so there is no way to observe which branch short-circuited — `failedAt`
  is unreachable through the public API.
- A `var` on a missing path returns its default or `null`, silently, which is the "rules silently
  never fire" risk already listed in `open-questions.md`.

The spike did not test any of this: conditions there are TypeScript predicates with a
`v(f, path, value)` helper that records reads. That leaves this as the largest unproven risk before
M1, which is why it needs deciding now rather than at implementation time.

## Options

1. **Use `json-logic-js` as is.** Drop `failedAt`; derive facts read by statically scanning the
   rule's `var` nodes before evaluation.
   - Pros: no library work; the same scan serves `content:lint`.
   - Cons: a static scan over-reports (a branch not taken is still listed) and cannot record values,
     so FR-14 is not met. "Why not" degrades to "the condition was false", which is most of FR-15.

2. **`json-logic-js` for the verdict, our own walker for facts and `failedAt`.** Two passes.
   - Pros: keeps the dependency and its operator coverage.
   - Cons: two evaluators can disagree, which is precisely the failure ADR-0010 was designed to make
     impossible. Also still needs the global `add_operation` to see `var`.

3. **A small evaluator over the FR-6 subset, returning a result tree (recommended).**
   `all` / `any` / `not`, comparisons, `in`, `var` — about ten operators.
   - Pros: facts read come out in read order with their values; every node has a JSON pointer, so
     `failedAt` is exact; unknown paths throw against the fact registry; one pass, no global state;
     runs in Node and the browser with no dependency (NFR-3).
   - Cons: we own it. Rules stop being portable to a stock JSON Logic runtime, and the supported
     subset must be documented and lint-enforced so authors cannot reach for an operator we lack.

4. **Fork `json-logic-js`.**
   - Pros: full operator coverage from day one.
   - Cons: every cost of option 3, plus maintaining code the core subset does not use.

```ts
type FactRead = { path: string; value: Json };

type ConditionResult = {
  value: boolean;
  factsRead: FactRead[];      // in read order, with values, only nodes actually visited
  failedAt: string | null;    // JSON pointer, e.g. '/all/1/==' ; null when the condition passed
};

evaluateCondition(condition: Json, facts: FactRegistry): ConditionResult;
```

Short-circuit semantics are part of the contract, not an implementation detail: `all` stops at its
first false child and reports that child as `failedAt`; `any` reports its own pointer when every
child is false; `not` reports the pointer of the child that was true.

## Decision

Option 3. `src/conditions/` owns a one-pass evaluator over the JSON Logic subset FR-6 names,
returning the verdict, the facts read with their values, and a JSON pointer to the sub-expression
that failed. `json-logic-js` is dropped as a dependency; the JSON Logic *syntax* is kept, so rules
stay readable, diffable and recognisable.

## Consequences

- ADR-0001's dependency list loses `json-logic-js`; `CREDITS.md` must lose it too (NFR-6).
- `content-authoring.md` gains the supported-operator table. Anything outside it fails
  `content:lint` (FR-17) at load time rather than evaluating to `null` at run time.
- The registry walk is shared: `content:lint` runs the same tree walk without values to check every
  `var` against `facts.yaml`, so lint and evaluation can never disagree about what a path means.
- `UnknownFactError` carries the JSON pointer of the offending `var`, which makes the FR-17 lint
  message and the run-time error the same message.
- Property tests: the facts reported are exactly the `var` nodes visited (not the ones present);
  `failedAt` always points at a node that evaluated false; a passing condition reports `null`.
- Risk moved rather than removed. The subset is small but it is new code on the critical path, so it
  gets written and tested against the real rule packs at the start of M1, before more rules exist to
  migrate. If the subset proves too narrow for the core-subset content, that is a new ADR, not a
  quiet widening.
