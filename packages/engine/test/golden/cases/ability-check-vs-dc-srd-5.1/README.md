# Ability check against a DC — SRD 5.1

The `ability-check-vs-dc` template with its defaults: a third-level fighter making a Strength
check against DC 15. `../ability-check-vs-dc-srd-5.2.1/` is the same run under the other
edition, and the two agree — which is the claim worth pinning.

## Deriving the outcome by hand

> *Using Ability Scores > Ability Checks.* Roll a d20 and add the relevant ability modifier.
> If the total equals or exceeds the DC, the check succeeds.

Strength 16 is +3, and the die is forced to 12:

    12 + 3 = 15

against DC 15. **Equals or exceeds** — so a total exactly on the DC is a **success**, which
is the boundary this case exists to fix.

## What this case pins down

- A non-attack D20 Test renders from a template and resolves on the `check` channel.
- A check with no skill reads `action.skill` as `null` without erroring, because the fact is
  declared nullable (ADR-0022).
- Both editions state the DC comparison identically, so the pair must not diverge.
