# "Use an Object" — SRD 5.1

Acceptance scenario 3 of `docs/requirements.md`, under the SRD 5.1 base:
**"'Use an Object' action — Use an Object."** The companion case `../use-an-object-srd-5.2.1/`
runs the same situation under the other edition.

## What the SRD says

*Combat > Actions in Combat > Use an Object.* Interacting with an object that needs your action
to use is the Use an Object action. Paraphrased as `action.use-object`, a `declare`-phase rule
whose only effect is to emit an event naming the action.

## The situation

One actor, the third-level fighter, taking a single `{ type: useObject }` action in round 1.
Nothing else is in play, so no d20 is rolled and nothing is compared or damaged.

## Deriving the outcome by hand

`action.use-object` reads `action.type`, which is `useObject`, so it fires and emits
`action.use-object` with `{ action: "Use an Object" }` — the name SRD 5.1 prints. No other rule
applies to a step that neither attacks nor tests: no rolls, no comparisons, no damage, no halt,
and the fighter ends at 28 hit points with no conditions.

## What this case pins down

The rule key the two editions share, and the name that differs between them. The 5.2.1 case
must emit the same event under the same key with a different `action`.
