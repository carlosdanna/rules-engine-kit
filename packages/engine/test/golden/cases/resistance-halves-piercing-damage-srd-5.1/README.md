# Resistance halves piercing damage

Hand-derived from SRD 5.1 "Damage Resistance and Vulnerability": *"If a creature or an
object has resistance to a damage type, damage of that type is halved against it"*, and
*"Resistance and then vulnerability are applied after all other modifiers to damage."*
5.1 does not restate the rounding here, so the halving rounds down under the general rule;
SRD 5.2.1 spells the same rounding out inline, which is why the 5.2.1 twin of this case
expects the same number (ADR-0025).

The shrub is the SRD Awakened Shrub: AC 9, 10 hit points, resistant to piercing and
vulnerable to fire. The shortbow deals piercing, so the resistance applies and the
vulnerability does not — the case pins down that a scale is matched on the damage *type*,
not merely on the creature having a list.

| Step | Working |
| --- | --- |
| Attack | forced d20 14, +1 Dex (ranged), +2 proficiency = 17 vs AC 9 → hit |
| Damage | forced 1d6 = 5 weapon, +1 Dex ability = 6 before the scale |
| Resistance | piercing ∈ the shrub's resistances → ⌊6 / 2⌋ = **3** |
| Hit points | 10 − 3 = 7, nothing discarded |

The shortbow's `vex` mastery is inert in both editions: neither pack has a rule for it, so
the two profiles produce the same outcome and the pair of cases proves it.
