# "Use an Object" — SRD 5.2.1

Acceptance scenario 3 of `docs/requirements.md`, under the SRD 5.2.1 base:
**"'Use an Object' action — Utilize (same `rule_key`, new label)."** The companion case
`../use-an-object-srd-5.1/` runs the same situation under the other edition.

## What the SRD says

*Rules Glossary > Utilize [Action].* Using a nonmagical object that needs an action is the
Utilize action. The pack keeps SRD 5.1's rule key, `action.use-object`, so a ruleset diff reports
it as the same rule with a changed label (VR-9) rather than as a removal and an addition.

## The situation

Identical to the 5.1 case: the third-level fighter takes one `{ type: useObject }` action.

## Deriving the outcome by hand

The condition is the same as 5.1's, so the rule fires and emits `action.use-object` — now with
`{ action: "Utilize" }`. As under 5.1 there is nothing to roll, compare or damage, and the fighter
ends at 28 hit points with no conditions.

## What this case pins down

Same situation, same rule key, same event — only the edition's name for the action differs.
