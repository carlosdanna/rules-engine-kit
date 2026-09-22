# Melee attack from a template — SRD 5.1

The `melee-attack` template rendered with its defaults under `srd-5.1`. Its companion
`../melee-attack-srd-5.2.1/` is the same template, the same params and the same dice under
the other edition; everything that differs between them comes from the packs and from which
`goblin` fixture the profile resolves.

## The situation

`renderTemplate` inlines `fighter-3` as the attacker, `goblin` as the target and `longsword`
into `items`. Under this profile the `goblin` slug resolves to the SRD 5.1 stat block —
**AC 15, 7 hit points** — because that fixture is scoped to `srd-5.1` and the 5.2.1 variant
is not (ADR-0017, ADR-0026).

## Deriving the outcome by hand

*Playing the Game > Attack Rolls*: an attack roll adds the ability modifier used to make it
and the proficiency bonus, when proficient. A melee weapon attack uses Strength, and
`fighter-3` has Strength 16 (+3) and a proficiency bonus of +2:

    12 (forced) + 3 (Strength) + 2 (proficiency) = 17

against AC 15 — a **hit**. *Damage Rolls*: the weapon's damage die plus the same ability
modifier. A longsword deals 1d8 slashing:

    5 (forced) + 3 (Strength) = 8 slashing

The goblin has 7 hit points, so the 8 takes it to **0 and one point is discarded**, which the
outcome reports rather than acts on (ADR-0023).

## What this case pins down

- A template renders into a situation the engine can evaluate, with its fixtures inlined.
- The `goblin` slug resolves to the 5.1 stat block under this profile and not the other one.
- Nothing applies a `sapped` condition: SRD 5.1 has no weapon mastery, so the longsword's
  `mastery: sap` field simply goes unread (ADR-0022).
