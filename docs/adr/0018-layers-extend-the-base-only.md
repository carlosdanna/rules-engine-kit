# ADR-0018: A layer extends the base, never another layer

- Status: accepted
- Date: 2026-09-22

## Context

Q16. VR-3 says a layer declares the base it applies to and a compatible range, and VR-4 says layer
order is explicit with the last winning. Neither says whether a layer may declare *another layer* as
the thing it extends — for instance a house-rule layer that only makes sense on top of a 5.2.1 layer.

The resolver already takes a position: `assertResolvable` requires position 0 to be a `base` with
`extends: null`, and every later pack to be a `layer` whose `extends.id` equals that base's id,
throwing `IncompatibleStackError { kind: 'base-mismatch' }` otherwise. The question is whether to
ratify that or to widen it before content is written against it.

## Options

1. **Layers may extend layers.** `extends` names any pack in the stack; compatibility is checked
   against whatever it names.
   - Pros: a layer can state a dependency precisely — "this house rule assumes the 5.2.1 layer" —
     rather than a range over the base that is really a proxy for that.
   - Cons: an ordered stack becomes a dependency graph. Resolution needs a topological order, which
     may disagree with the user's declared order, and VR-4 says the declared order is the one that
     decides precedence. Two orders that can disagree is a defect waiting to happen, and the error
     messages for a cycle or an unsatisfiable graph are far worse than `base-mismatch`.

2. **Layers extend the base only (recommended).** Position 0 is the base; every layer declares that
   base and a semver range over it.
   - Pros: the stack is a list, precedence is position, and compatibility is one range check per
     layer. `IncompatibleStackError` can name the layer, the position and the range it failed.
   - Cons: a layer cannot express a dependency on another layer. It can only say which base versions
     it works with, and an author who needs more says so in prose.

3. **No compatibility declaration at all.** Any pack may be stacked on any other.
   - Pros: simplest possible resolver.
   - Cons: contradicts VR-3, and silently produces nonsense profiles — a 5.1 layer on a 5.2.1 base
     resolves happily and then behaves in ways no citation explains.

## Decision

Option 2, ratifying the resolver's current behaviour. A stack is a base at position 0 followed by
layers, each declaring `extends: { id, range }` naming that base. Cross-layer dependencies are not
expressible and are not needed.

## Consequences

- No code changes. `resolveProfile` already enforces this and
  `packages/engine/test/resolver/resolveProfile.test.ts` already covers it; this ADR records the
  decision the code was making unwitnessed.
- The demo's own content is unaffected, and this is the evidence the restriction is not too tight:
  SRD 5.1 and SRD 5.2.1 are two versions of one ruleset id, so the house-rule layer's `extends.range`
  spans both and the acceptance scenario "Melee vs prone + house flanking — same, on either base"
  works without a layer ever naming a layer.
- A layer that genuinely depends on another layer's rules has one honest option: `override` the keys
  it needs and carry its own bodies. That is louder than a declared dependency, and being loud about
  a rule body is what VR-9's version diff is for.
- `docs/content-authoring.md`'s `extends` example stays as it is; the restriction is now cited.
