# Saving throw against an effect — SRD 5.1

The `saving-throw-vs-effect` template with its defaults: a restrained fighter making a
Dexterity saving throw against DC 13. `../saving-throw-vs-effect-srd-5.2.1/` is the same run
under the other edition, and the two agree.

## What the SRD says

> *Appendix A: Conditions > Restrained.* The creature has disadvantage on Dexterity saving
> throws.

Paraphrased in `condition.restrained.dex-save`, which grants disadvantage on the `save`
channel — not a numeric penalty, because advantage and disadvantage resolve on their own
channel and cancel rather than sum (ADR-0011, FR-11).

## Deriving the outcome by hand

Disadvantage rolls two dice and keeps the **lower**. The pool is forced to `[14, 6]`, so the
kept die is **6**. Dexterity 12 is +1:

    6 + 1 = 7

against DC 13 — a **failure**. The 14 is rolled and discarded, which is what makes
disadvantage observable rather than a matter of trust.

## What this case pins down

- The roll-mode channel applies to a `save` target, not only to attacks.
- A condition on the *saver* changes its own roll, where cover and prone change a roll made
  against a target.
