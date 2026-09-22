# Surprised at combat start — SRD 5.1

Acceptance scenario 1 of `docs/requirements.md`, under the SRD 5.1 base:
**"Surprised creature at combat start — cannot act on its first turn."**

## What the SRD says

> *Combat > The Order of Combat > Surprise.* A creature that doesn't notice a threat is
> surprised at the start of the encounter. If you're surprised, you can't move or take an
> action on your first turn of the combat, and you can't take a reaction until that turn
> ends.

Paraphrased in `combat.surprise`. Two readings are recorded on that rule: who is surprised
is the GM's call from Stealth against passive Perception, which is out of scope (ADR-0003),
so the situation declares it as a condition; and reactions are out of scope, so the halt is
the whole of what the pack encodes.

## The situation

A Guard (SRD 5.1 stat block: AC 16, HP 11, Str 13, Dex 12, proficiency bonus +2) attacks a
Goblin (AC 15, HP 7) with a battleaxe (1d8 slashing) on its turn in round 1 and again in
round 2. The Guard carries the `surprised` condition. The battleaxe's mastery property is
`topple`, which this demo does not encode — SRD 5.1 has no mastery rules at all, and the
core subset asks for one mastery, which is 5.2.1's Sap.

## Deriving the outcome by hand

**Round 1 — the surprised turn.** `combat.surprise` is selected in the `declare` phase. Its
condition asks for `surprised` among the actor's conditions (true) and `step.round == 1`
(true), so it fires and halts the step. Nothing after `declare` runs, so this step has no
roll, no comparison and no damage; `halted` names the rule and its reason. That is the
scenario's claim: the creature cannot act.

**Round 2 — the same attack, unhindered.** `combat.surprise` is selected again and skipped,
because `step.round` is 2. The `modifiers` phase then contributes:

| Rule | Term | Why |
| --- | --- | --- |
| `attack.ability-modifier.strength` | +1 | Str 13 → (13 − 10) / 2 rounded down = +1, and a melee weapon attack uses Strength |
| `attack.proficiency` | +2 | the Guard's printed proficiency bonus |

No condition, cover or spell applies, so the roll mode is `normal` and one d20 is rolled.
The die is forced to **14** (`forced.json`), so the attack roll totals

    14 + 1 (Strength) + 2 (proficiency) = 17

The Goblin's effective AC is its printed 15 with nothing modifying it, and 17 ≥ 15, so the
attack **hits**.

Damage, from `Combat > Damage and Healing > Damage Rolls` — "you roll the damage die, add
any modifiers", and "when attacking with a weapon, you add your ability modifier — the same
modifier used for the attack roll":

    1d8 forced to 5, + 1 (Strength) = 6 damage

The Goblin has 7 hit points and 7 − 6 = **1**, which is where `finalState` leaves it. The
Guard is untouched and still carries `surprised`: the condition is printed on the situation
and no rule removes it — round 2 simply no longer asks about it.

## What this case pins down

- A `halt` ends the step and leaves the rest of the phases with nothing to record (FR-9).
- Surprise is the round, not the creature: the same rule fires once and is skipped once.
- Ability modifiers and the proficiency bonus are read from the fixture, not written into
  the rules — each term carries the `fromFact` path it came from (FR-8, ADR-0021).
