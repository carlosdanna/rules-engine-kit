# Spend inspiration on an attack — SRD 5.1

Acceptance scenario 2 of `docs/requirements.md`, under the SRD 5.1 base:
**"Spend inspiration on an attack — advantage."**
The companion case `../inspiration-on-an-attack-srd-5.2.1/` runs the other edition on the
same dice, and the two diverge.

## What the SRD says

> *Beyond 1st Level > Inspiration > Using Inspiration.* If you have inspiration, you can
> expend it when you make an attack roll, saving throw, or ability check. Spending your
> inspiration gives you advantage on that roll.

Paraphrased in `inspiration.spend`. Two readings are recorded on the rule. The SRD gives
inspiration to a *player character*, and a fixture is a stat block rather than a character
sheet (FR-8), so the pack spends it for whichever creature the situation declares the intent
for. And whether it is spent at all is `intents.useInspiration`, declared up front, because
evaluation never pauses for a choice (ADR-0003).

## The situation

The Guard (Str 13, proficiency bonus +2) attacks a Goblin (AC 15, HP 7) with a battleaxe.
`intents.useInspiration` is `true`. The situation also declares
`intents.rollChoices["r1-guard/attack:guard"].rerollDieIndex = 0`, which this edition never
reads — it is there so that the two cases run the *same* situation shape and only the
ruleset differs, which is what makes them comparable (FR-16).

## Deriving the outcome by hand

Three rules fire in `modifiers`, on two separate channels:

| Rule | Channel | Contribution |
| --- | --- | --- |
| `attack.ability-modifier.strength` | numeric | +1 (Str 13) |
| `attack.proficiency` | numeric | +2 |
| `inspiration.spend` | roll mode | advantage |

Advantage rolls two d20s and keeps the higher. The dice are forced to **9 and 16**, so the
roll keeps **16**:

    16 + 1 (Strength) + 2 (proficiency) = 19

against the Goblin's effective AC of 15 — a **hit**, and the die that made it a hit is the
second one, which only advantage let the attacker reach.

Damage: the battleaxe's 1d8 forced to 3, plus the same Strength modifier the attack roll
used (*Combat > Damage and Healing > Damage Rolls*), = **4**. The Goblin's 7 hit points
become **3**.

## The point of the pair

The 5.2.1 case forces the *same* first die, 9, and its Heroic Inspiration rerolls it to 4 —
which it must then keep. So spending inspiration on identical dice **hits under 5.1 and
misses under 5.2.1**: advantage can only help, a mandatory reroll can hurt. That is the
mechanical difference between the editions, and it is why the two live on separate channels
in the engine (`rollMode` and `rollTransform`, ADR-0011) rather than being two spellings of
one thing.

## What this case pins down

- Spending inspiration is a roll-mode grant under 5.1, and the trace names the rule that
  granted it.
- Advantage keeps the higher of two dice.
- The same `rule_key` carries a different body in each edition (VR-9).
