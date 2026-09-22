# Buffed round — SRD 5.2.1

The `buffed-round` template with its defaults: an acolyte casts *bless* on a third-level
fighter, who then attacks an ogre in rounds 1, 2 and 3. This is the only starter template
whose subject is a **duration**, which is why it needs a multi-turn timeline (ADR-0005).

## What the SRD says

> *Spells > Spell Descriptions > Bless.* You bless up to three creatures. Whenever a target
> makes an attack roll or a saving throw before the spell ends, the target rolls a d4 and
> adds the number rolled to the attack roll or save.

Paraphrased as `spell.bless.cast` (applies a `blessed` condition) and `spell.bless.attack`
(adds 1d4 to an attack roll while blessed). Two readings are recorded on the cast rule:
concentration is not simulated (ADR-0003), and a 1-minute span is ten rounds ending at the
end of the caster's turn (ADR-0012).

## Deriving the outcome by hand

The cast step rolls nothing. `spell.bless.cast` applies `blessed` to the fighter during that
step's `apply` phase, so every later step sees it — including the fighter's own attack later
in round 1.

Each attack is Strength 16 (+3), proficiency +2, plus the bless die on its own channel:

| Round | d20 | bless | Total | vs AC 11 |
| --- | --- | --- | --- | --- |
| 1 | 10 | 3 | 10 + 3 + 2 + 3 = **18** | hit |
| 2 | 10 | 4 | 10 + 3 + 2 + 4 = **19** | hit |
| 3 | 10 | 2 | 10 + 3 + 2 + 2 = **17** | hit |

Damage each time is `1d8 4 + 3 (Strength) = 7` slashing. The SRD 5.2.1 ogre has **68** hit
points, so it ends on 68 − 21 = **47**.

## What this case pins down

- A condition applied by a rule persists across steps and rounds, and is **still live in
  round 3**: `expiresAt` is `beyondTimeline`, because ten rounds outlast this timeline.
- Bless's 1d4 rolls on its own channel per round (`…/attack:attacker:bless`), so forcing it
  does not disturb the d20 — and the trace shows the die behind the bonus (ADR-0011).
- The bonus arrives through the numeric channel under a `bless` stack key with the `unique`
  policy, so a second casting could not stack with it.
