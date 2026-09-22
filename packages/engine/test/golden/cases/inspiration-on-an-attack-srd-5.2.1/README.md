# Spend inspiration on an attack — SRD 5.2.1

Acceptance scenario 2 of `docs/requirements.md`, under the SRD 5.2.1 base:
**"Spend inspiration on an attack — reroll the d20."**
The companion case `../inspiration-on-an-attack-srd-5.1/` runs the other edition on the same
first die.

## What the SRD says

> *Rules Glossary > Heroic Inspiration.* If you have Heroic Inspiration, you can expend it to
> reroll any die immediately after rolling it, and you must use the new roll.

Paraphrased in `inspiration.spend` — the same rule key as SRD 5.1's, with a body on a
different channel. Three readings are recorded on it: who may spend it (as in 5.1); that
"any die" is applied to the step's own d20, the only die a D20 Test rolls in this subset;
and that "you must use the new roll" is `transform: { kind: reroll, keep: new }`, which
keeps the reroll even when it is worse (ADR-0011).

Which die a reroll touches is the player's, so the effect's `dieSelector` is `intent` and
reads `intents.rollChoices[<rollId>].rerollDieIndex` — declared up front, because evaluation
never pauses (ADR-0003). This situation declares die 0.

## The situation

The same Guard and battleaxe as the 5.1 case, against the 5.2.1 Goblin Warrior (AC 15,
HP 10). `intents.useInspiration` is `true` and the reroll is aimed at die 0.

## Deriving the outcome by hand

The numeric channel contributes exactly what it did under 5.1: +1 Strength,
+2 proficiency. Nothing grants advantage or disadvantage, so the roll mode is `normal` and
the pool is a single d20, forced to **9**.

`inspiration.spend` requests one `reroll` transform on die 0. Transforms act on the dice
pool *before* the keep (ADR-0011), and the reroll draws from its own channel — the forced
value at `r1-guard/attack:guard:reroll`, which is **4**. Because the transform keeps `new`,
the pool becomes `[4]` and the kept die is **4**, not the 9 it replaced:

    4 + 1 (Strength) + 2 (proficiency) = 7

against an effective AC of 15 — a **miss**. Nothing is rolled for damage: the damage rules
are selected in the `damage` phase and ask `step.attack.result` first, which is `miss`
(ADR-0021), so the Goblin Warrior keeps all 10 hit points and the outcome records no damage
at all.

## The point of the pair

The 5.1 case is the same attacker, the same weapon, the same target AC and the same first
die, and it **hits** — because 5.1 spends inspiration for advantage, which can only help,
while 5.2.1 spends it for a reroll it is then obliged to keep. A rule that makes the roll
worse is the honest reading of "you must use the new roll", and pinning it down is the
reason this case forces a bad reroll rather than a good one.

## What this case pins down

- `keep: new` keeps a worse die (ADR-0011), and the trace shows the replacement: `dice [9] →
  reroll die[0] 9→4 → [4]`.
- A reroll draws from its own `:reroll` channel, so forcing it does not disturb the d20.
- A miss produces no damage roll at all, rather than damage that is discarded.
