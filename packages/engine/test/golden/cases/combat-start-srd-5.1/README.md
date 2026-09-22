# Combat start, surprised — SRD 5.1

Acceptance scenario 1 of `docs/requirements.md` reached from a template, rather than from a
hand-written situation: **"Surprised creature at combat start — cannot act on its first
turn."** The companion `../combat-start-srd-5.2.1/` is the same template under the other
edition, and the contrast between the two is the whole demonstration.

## What the SRD says

> *Combat > The Order of Combat > Surprise.* A surprised creature can't move or take an
> action on its first turn of combat.

Paraphrased in `combat.surprise`, which halts the step. Who is surprised is the GM's call
from Stealth against passive Perception, which is out of scope (ADR-0003), so the template
declares it as a `surprised` condition — `attackerConditions` defaults to `[surprised]`.

## Deriving the outcome by hand

The rule fires in the `declare` phase on any step of round 1, so **both** round-1 steps —
the Initiative check and the attack — halt before rolling anything. Their `rolls`,
`comparisons` and `damage` are all empty and `halted` names the rule.

Round 2 is an ordinary attack: `12 + 3 (Strength) + 2 (proficiency) = 17` against AC 15, a
hit, then `1d8 5 + 3 = 8` slashing against the SRD 5.1 goblin's 7 hit points — **0, with 1
discarded** (ADR-0023).

## What this case pins down

- A halt produces a step with no rolls at all, rather than rolls that are thrown away.
- "First turn of combat" is read as the creature's steps in round 1, which is what a
  timeline of rounds can express — so round 2 is unaffected.
