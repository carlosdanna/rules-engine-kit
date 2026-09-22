# Combat start, surprised — SRD 5.2.1

The other half of acceptance scenario 1: **"Acts; disadvantage on initiative."** Same
template, same params, same first dice as `../combat-start-srd-5.1/`.

## What the SRD says

> *Rules Glossary > Surprise.* If a creature is caught unawares by the start of combat, it
> has Disadvantage on its Initiative roll.

The same `rule_key` as SRD 5.1's and an entirely different body — a `rollMode` grant instead
of a `halt`. That one swap is what the effect-channel split buys (ADR-0011). The engine
declares no Initiative roll of its own, so Initiative is a `check` step whose `skill` is
`initiative` and whose DC is 0: this repository's convention, recorded on the rule.

## Deriving the outcome by hand

**Initiative.** Disadvantage rolls two dice and keeps the lower: the pool is `[15, 6]`, so
the kept die is **6**. Dexterity 12 is +1, for a total of **7**.

**Round 1 attack.** Nothing halts it. `7 + 3 (Strength) + 2 (proficiency) = 12` against
AC 15 — a **miss**, so no damage is rolled at all: the damage rules ask `step.attack.result`
first (ADR-0021).

**Round 2 attack.** `16 + 3 + 2 = 21`, a hit. `1d8 5 + 3 = 8` against the Goblin Warrior's
10 hit points leaves **2**, and the longsword's Sap mastery marks it `sapped`.

## The point of the pair

Under 5.1 the fighter does nothing in round 1 and kills the goblin in round 2. Under 5.2.1 it
acts in round 1 and misses, and the goblin is still standing at the end. Same template, same
seed, same first die — the difference is entirely in the packs.
