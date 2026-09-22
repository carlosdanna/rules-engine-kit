# Melee attack from a template — SRD 5.2.1

The same template, params and dice as `../melee-attack-srd-5.1/`, under the other edition.

## What differs, and why

Two things, both from content rather than from the engine:

1. **The target.** The `goblin` slug resolves to SRD 5.2.1's *Goblin Warrior* — **AC 15, 10
   hit points** — so the same 8 damage leaves it standing with 2 rather than dropping it.
2. **The longsword's mastery.** SRD 5.2.1 gives the longsword the Sap property, and this pack
   encodes it: a hit marks the target with `sapped` until the start of the attacker's next
   turn, which is the active effect in `finalState`. SRD 5.1 has no such rule.

The attack arithmetic is identical — `12 + 3 (Strength) + 2 (proficiency) = 17` against
AC 15, a hit, then `1d8 5 + 3 = 8` slashing — which is the point of the pair.

## What this case pins down

- One template and one set of params produce different, correct outcomes per profile.
- A condition applied with a duration appears both on the actor and in `activeEffects`.
