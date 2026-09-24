# Melee vs prone + house flanking — SRD 5.2.1 base

Acceptance scenario 5 of `docs/requirements.md`, on the SRD 5.2.1 base:
**"Melee vs prone + house flanking — advantage, doesn't double; same on either base."** The
companion case on the other base is `../flanking-on-a-prone-target-srd-5.1+flanking/`.

## What the rules say

- *Rules Glossary > Prone [Condition]*: an attack roll against a prone creature has advantage if the attacker is within
  5 feet. Paraphrased as `condition.prone.attacked`.
- `house.flanking` (`content/house-flanking/`, not SRD): a melee attack roll against a
  `flanked` creature has advantage.
- Advantage does not stack: however many sources grant it, you roll two d20s and keep the
  higher (SRD 5.2.1, Advantage and Disadvantage). The roll-mode channel resolves grants as a set
  (ADR-0011), so two grants are still one advantage.

## The situation

The `melee-attack` template rendered under `srd-5.2.1` with its defaults — a third-level
fighter (Str 16, PB +2) with a longsword against the Goblin Warrior (AC 15, 10 HP), 5 feet away — with the target's
conditions set to `[prone, flanked]`. It is a literal `situation.json` rather than a
`template.json`, because no fixture is scoped to a `+flanking` profile and a template case
renders against the slug it runs under (ADR-0026). The profile is the base pack plus the
house-flanking layer, base first.

## Deriving the outcome by hand

Both `condition.prone.attacked` (range 5 ≤ 5) and `house.flanking` (melee, target flanked)
grant advantage; nothing grants disadvantage. The mode is **advantage**, and the pool is
**two** d20s, forced to `[4, 17]` — if the grants doubled up the trace would show a third die, and
the narrative snapshot shows `dice [4,17]`. The higher, **17**, is kept:

    17 + 3 (Strength 16) + 2 (proficiency) = 22 vs AC 15 — a hit

Damage is the longsword's 1d8, forced to 5, plus the Strength modifier: **8 slashing**. The
target's 10 hit points drop to **2**.

The attack hits with a longsword, so `weapon.mastery.sap` (Equipment > Mastery Properties > Sap) gives the target the `sapped` condition until the attacker's next turn, which this one-step timeline never reaches — so it is still active at the end.

## What this case pins down

Two sources of advantage — one SRD rule, one house rule from a layer — resolve to a single
advantage on either base, and the layer resolves on top of both editions (VR-2, VR-4).
