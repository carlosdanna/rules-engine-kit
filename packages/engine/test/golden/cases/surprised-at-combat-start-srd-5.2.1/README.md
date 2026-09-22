# Surprised at combat start — SRD 5.2.1

Acceptance scenario 1 of `docs/requirements.md`, under the SRD 5.2.1 base:
**"Surprised creature at combat start — acts; disadvantage on initiative."**
The companion case `../surprised-at-combat-start-srd-5.1/` runs the other edition.

## What the SRD says

> *Rules Glossary > Surprise.* If a creature is caught unawares by the start of combat, that
> creature is surprised, which causes it to have Disadvantage on its Initiative roll.

Paraphrased in `combat.surprise` — the **same rule key** as SRD 5.1's, carrying a different
body. That is the whole of what changed between the editions, and it is what the version
diff (VR-9) compares.

Two readings are recorded on the rule. Who is surprised is declared as a condition, as in
5.1. And the engine declares no Initiative roll of its own — `RollTargetKind` has an
`initiative` member but no step produces one — so an Initiative roll is modelled as a
`check` step whose `skill` is `"initiative"`. That convention is this demo's, not SRD
wording. The step carries `dc: 0` because the schema requires a DC and an Initiative roll
has none: it is compared with the other combatants' rolls, and turn order is out of scope
(ADR-0003). Nothing in the outcome depends on that 0 except the `success` it forces.

## The situation

The same Guard as the 5.1 case (AC 16, HP 11, Str 13, Dex 12, proficiency bonus +2),
carrying `surprised`, against a Goblin Warrior — the 5.2.1 stat block, which is a different
fixture: AC 15 as in 5.1, but HP 10 and Dex 15. It rolls Initiative and then attacks with a
battleaxe, both in round 1.

## Deriving the outcome by hand

**The Initiative roll.** Two rules are selected in `modifiers` and both fire:

| Rule | Contribution |
| --- | --- |
| `d20.ability-modifier.dex` | +1, from Dex 12 → (12 − 10) / 2 = +1 |
| `combat.surprise` | disadvantage on the check |

Disadvantage means two d20s and the lower is kept. The dice are forced to **15 and 6**, so
the roll keeps **6** and totals

    6 + 1 (Dexterity) = 7

against the step's DC of 0, which is a `success` and means nothing. What the scenario claims
is the `"disadvantage"` mode and the kept 6 — the creature acts, and pays for it here.

No proficiency bonus is added: a stat block carries no skill proficiencies (FR-8), so this
pack has nothing to read and `d20.ability-modifier.dex` is the only term.

**The attack.** `combat.surprise` is selected again and skipped — its condition asks for a
`check` naming the `initiative` skill, and this step is an attack. So the surprised creature
attacks unhindered, which is precisely the edition difference:

    12 (forced) + 1 (Strength 13) + 2 (proficiency) = 15

against the Goblin Warrior's effective AC of 15. A roll that *equals* the AC hits — "an
attack roll hits if the roll equals or exceeds the target's Armor Class" (*Playing the Game >
D20 Tests > Attack Rolls*) — so this is a hit at the boundary, on purpose.

Damage: 1d8 forced to 4, plus the same Strength modifier the attack roll used, = **5**. The
Goblin Warrior's 10 hit points become **5**.

The battleaxe's `topple` mastery is read by no rule in this pack: the core subset asks for
one weapon mastery and Sap is it, so `topple` goes unnoticed. Nothing marks the target.

## What this case pins down

- The 5.1 and 5.2.1 packs answer the same acceptance scenario with the same `rule_key` and
  different bodies, which is the versioning story the demo is built to show (VR-9).
- A surprised creature under 5.2.1 acts: only its Initiative roll is affected.
- Disadvantage keeps the lower of two dice, and the trace names the rule that granted it.
- Hitting on a total exactly equal to AC.
