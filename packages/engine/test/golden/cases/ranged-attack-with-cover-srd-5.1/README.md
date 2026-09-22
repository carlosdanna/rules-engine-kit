# Ranged attack into half cover — SRD 5.1

The `ranged-attack-with-cover` template with its defaults: a third-level fighter shooting a
shortbow at a goblin 60 feet away that has half cover.

## What the SRD says

> *Combat > Cover.* A target with half cover has a +2 bonus to AC and Dexterity saving
> throws.

A situation has no geometry — grids and movement are out of scope (ADR-0003) — so cover is
carried as a condition on the creature benefiting from it, and `cover.half` adds its +2 to
`actor.ac.effective` rather than subtracting from the attack roll. The bonus takes the
`highest` policy on a shared `cover` stack key, because the SRD says only the most protective
degree applies and that degrees are not added together.

## Deriving the outcome by hand

A **ranged** weapon attack uses Dexterity, not Strength: `fighter-3` has Dexterity 12 (+1),
and a proficiency bonus of +2.

    15 (forced) + 1 (Dexterity) + 2 (proficiency) = 18

The goblin's printed AC is 15; half cover makes the effective AC **17**. 18 beats it by one —
a **hit**, and a hit that would have missed without the template's default cover being
applied to the *target's AC* rather than to the attacker's roll.

Damage is the shortbow's 1d6 piercing plus the same Dexterity modifier:

    4 (forced) + 1 (Dexterity) = 5 piercing

against the SRD 5.1 goblin's 7 hit points, leaving **2**.

## What this case pins down

- A ranged attack draws its ability modifier from Dexterity on both the attack and the damage.
- Cover is a derived-AC modifier (ADR-0006), reported with the terms it came from.
- The shortbow's `mastery: vex` goes unread: neither pack encodes Vex, and a fixture carrying
  a property no rule reads is correct content.
