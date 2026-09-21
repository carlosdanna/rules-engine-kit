# Spike notes: durations, stacking and roll channels

- Date: 2026-09-21
- Code: `packages/engine/spike/` (throwaway, excluded from the build — see its `README.md`)
- Closes the top risk in `open-questions.md`: *"Rule model can't express durations and stacking
  cleanly — shape set by ADR-0007 and ADR-0008; still spike Bless, prone and Heroic Inspiration
  first to prove it."*

Three rules were modelled end to end against the SRD PDFs, with every expected number
hand-derived from the rules text before the code ran (24 tests, all passing):

1. Heroic Inspiration (5.2.1) reroll vs Inspiration (5.1) advantage on the same attack.
2. Bless lasting 10 rounds and expiring mid-sequence.
3. Prone: melee advantage, ranged disadvantage, cancelling against another disadvantage source.

**Headline: the shapes hold. Two accepted ADRs are wrong in detail and need superseding
(ADR-0008's roll order, ADR-0007's `rounds` duration), and ADR-0010 is missing two event kinds.**
`@dice-roller/rpg-dice-roller` is not usable under ADR-0002; a 40-line seeded roller replaces it.

---

## 1. What worked

**ADR-0005 (timeline).** A 24-step, 12-round situation ran as one pure call and a single-step
situation stayed trivial. Bless expired inside the run and the trace showed exactly where. No
pressure at all towards a resumable stepper.

**ADR-0008 (three channels).** This is the decision that paid off most. The 5.1-vs-5.2.1
Inspiration acceptance scenario is a one-line difference between two layers that share a
`rule_key`:

```ts
// srd-5.1
effects: [{ type: 'rollMode',      target, mode: 'advantage' }]
// srd-5.2.1
effects: [{ type: 'rollTransform', target, transform: { kind: 'reroll', keep: 'new' }, uses: 1 }]
```

With the same forced dice `(15, 4)` and AC 15, 5.1 keeps the 15 and hits for 20; 5.2.1 must keep
the new roll and misses with 9. Narrative rendering of the same attack under both profiles:

```text
=== SRD 5.1 ===
  [modifiers] inspiration.spend fired (srd-5.1 · Inspiration > Using Inspiration)
  [roll] attack:fighter: advantage from inspiration.spend ⇒ advantage
         dice [15,4]
         kept 15 +3 ability +2 proficiency = 20
  [compare] 20 vs DC 15 → hit

=== SRD 5.2.1 ===
  [modifiers] inspiration.spend fired (srd-5.2.1 · Rules Glossary > Heroic Inspiration)
  [roll] attack:fighter: no mode inputs ⇒ normal
         dice [15] → reroll die[0] 15→4 (inspiration.spend) → [4]
         kept 4 +3 ability +2 proficiency = 9
  [compare] 9 vs DC 15 → miss
```

Had numeric modifiers and roll modes shared one effect type (ADR-0008 option 1), this would have
been a rule rewrite instead of a channel swap.

**Advantage/disadvantage as a set operation.** Both SRDs say the same thing, and both say it
explicitly for the lopsided case:

> If circumstances cause a roll to have both Advantage and Disadvantage, the roll has neither of
> them, and you roll one d20. This is true even if multiple circumstances impose Disadvantage and
> only one grants Advantage or vice versa. — SRD 5.2.1, *Playing the Game > D20 Tests*
> (SRD 5.1, *Using Ability Scores > Advantage and Disadvantage* is worded almost identically.)

Collecting `{ruleKey, mode}` inputs and reducing with `any adv && any dis → normal` is correct and
order-independent, and only one die is rolled at all when they cancel. Verified for
1 adv + 1 dis and for 1 adv + 2 dis, on both editions.

**Prone reads straight out of the SRD** as two rules on the attacker's distance
(`condition.prone.attacked-within-5ft`, `…-beyond-5ft`) plus one on the prone creature's own
attacks. Identical wording in 5.1 *Appendix PH-A: Conditions > Prone* and 5.2.1 *Rules Glossary >
Prone [Condition]*, so the same rule bodies are cited to both packs.

**Stacking policies (FR-11).** `sum` for the ability modifier, `unique` by `stackKey` for the
proficiency bonus ("can't be added to a die roll more than once") and for Bless. `highest` is
implemented but nothing in these three rules needed it — cover will.

**Layers.** A `house-flanking` layer stacked on either base without touching it, and its second
advantage grant correctly did **not** double: still one pair of d20s (the acceptance scenario
"Melee vs prone + house flanking: advantage, doesn't double" passes on both bases).

**ADR-0010 (flat events) + ADR-0009 (provenance).** Emitting one `rule` event per enabled rule per
step and phase made "why not" a pure lookup, and `factsRead` came out in the order the condition
read them — e.g. the skipped `condition.prone.attacked-beyond-5ft` records
`step.action.type`, `actor.dummy.conditions`, `action.rangeFt`.

**Determinism (NFR-1).** Same seed, no forced rolls: outcome and trace are deep-equal across runs.

---

## 2. What the effect and trace types need

### 2.1 ADR-0008's roll resolution order is wrong

ADR-0008 fixes the order as *mode → roll the die (or the pair, keeping high/low) → transforms
applied to the kept die → modifiers*. The SRD says a reroll happens **inside the pair, before the
keep**:

> When you have Advantage or Disadvantage and something in the game lets you reroll or replace the
> d20, you can reroll or replace only one die, not both. You choose which one.
> — SRD 5.2.1, *Playing the Game > Interactions with Rerolls*

> When you have advantage or disadvantage and something in the game, such as the halfling's Lucky
> trait, lets you reroll the d20, you can reroll only one of the dice. You choose which one.
> — SRD 5.1, *Using Ability Scores > Advantage and Disadvantage*

The difference is observable, not cosmetic. Melee attack on a prone target (advantage), attacker
spends Heroic Inspiration, forced pair `(4, 16)`, reroll of the 4 comes up `11`, AC 20:

| Order | Result |
| --- | --- |
| SRD / spike: reroll die 0 → `(11, 16)` → keep 16 → 16 + 5 = **21** | **hit** |
| ADR-0008: keep 16 → reroll it → 11 → 11 + 5 = **16** | **miss** |

Proposed order, as implemented in `spike/engine.ts`:

```text
1. roll mode   any advantage + any disadvantage -> normal; else advantage/disadvantage
2. dice pool   1 die if normal, 2 otherwise; forced rolls substitute here
3. transforms  in rule priority order, each consuming one use, applied to a CHOSEN die of the pool
4. keep        max / min / the only die
5. modifiers   stacking policies, added to the kept die
```

Two consequences:

- `rollTransform` needs a **die selector**. Which die to reroll is a player choice, so under
  ADR-0003 it has to be declared in `situation.intents`. The spike used a single
  `intents.rerollDieIndex`, which is obviously too coarse — a timeline with two rerolls needs it
  keyed per roll.
- `minimumDie` and `replaceDie` transforms have the same question and the same answer.

### 2.2 ADR-0007's `{ kind: 'rounds' }` cannot be resolved to a `TimePoint`

`{ kind: 'rounds'; rounds: number }` is underspecified: 10 rounds of *whose* turns, ending on which
edge? Bless needs the caster's turn and the end edge. The spike added them:

```ts
| { kind: 'rounds'; rounds: number; anchorActorId: string; edge: Edge }
```

Related gaps found while making Bless expire:

- **Resolution needs the whole timeline**, not just the current step. ADR-0007 says the phase loop
  "passes a time context into the effect registry"; that context must let the resolver find *the
  anchor actor's turn in round R + N*, i.e. it needs the timeline (or a precomputed
  actor × round → stepIndex index).
- **The SRD does not say which edge a 1-minute duration ends on.** Interpretation adopted here and
  recorded on the rule: 1 minute = 10 rounds, ending at the **end of the caster's turn** in round
  `cast + 10`. This must become a house convention for every time-span duration, not a per-rule
  decision.
- **Expiry is anchored to the caster, not the target,** and that is visible: the cleric casts in
  round 1 and acts before the fighter, so the fighter's round-11 attack is already unblessed even
  though the fighter has not yet had ten turns. Correct, surprising, and the trace has to make it
  legible — the `expiry` event names `r11-cleric`, not the fighter's step.
- **`expiresAt: null` is overloaded.** It currently means both "permanent" and "the anchor turn
  falls outside the declared timeline, so it outlives the run". Those need separating; the second
  is also the only case where a demo scenario can end with an effect still active.

Hand-derived check (all of it passing): d20 pinned to 12, Bless d4 pinned to 3, AC 20.
Blessed = `12 + 3 str + 2 prof + 3 bless = 20` → hit, rounds 1–10.
Unblessed = `12 + 3 + 2 = 17` → miss, rounds 11–12. One `effectApplied` event at `r1-cleric`
carrying `expiresAt: { round: 11, stepIndex: 20, edge: 'end' }`, one `expiry` event at
`r11-cleric` in the `expire` phase, nothing active at the end.

### 2.3 Trace event deltas (ADR-0010)

| Change | Why |
| --- | --- |
| Add `effectApplied` `{ effectId, sourceRuleKey, onActorId, expiresAt }` | ADR-0010 wants "an effect's scheduled end at the moment it is applied" but only defines an `expiry` event. Nothing records the application. |
| Add `compare` `{ target, total, dc, result }` | Hit/miss currently exists only in the outcome, so the trace can't narrate the comparison (NFR-7). Alternatively fold `dc`/`result` into the `roll` event. |
| `roll.transforms[]` needs `dieIndex` | Without it a viewer can't say *which* of the two dice was rerolled — the whole point of §2.1. |
| `roll` needs `diceAfterTransforms` and `keptIndex` alongside `dice` and `kept` | Same reason: `dice` is the pool as rolled, `kept` is the survivor, and the middle state is where the interesting thing happened. |
| Modifier records need `rolled: { expr, dice }` | ADR-0008 allows `value: DiceExpr`, but ADR-0010's `roll.modifiers[]` only carries a number. "+3 bless" has to show the d4 that produced it. |
| Reconsider the separate `stacking` event | The spike put `modifiers` and `dropped` on the `roll` event and never needed `stacking`. Keep it only for non-roll targets (effective AC, damage), or drop it. |
| `RollTarget` must become a structured type | The spike used the string `` `${kind}:${actorId}` ``. Once saves, checks and damage exist it needs to be real, and it becomes part of the forced-roll key (§2.4). |
| `Omit<TraceEvent, 'seq'>` does not distribute over the union | A trace emitter typed that way only sees the shared keys. Needs a distributive omit, or `seq` should be assigned by the trace builder instead of stripped from the event type. Small, but it bites immediately. |

### 2.4 `forcedRolls` keyed by step id is too fragile (architecture.md, FR-13)

> `forcedRolls` is keyed by step id; each entry supplies dice in the order the step consumes them.

One step here consumes an attack d20 (or a pair), possibly a reroll, and a Bless d4. A flat
per-step array couples the test fixture to the internal consumption order across phases — adding
one rule silently shifts every later forced value, and golden tests would fail in ways that look
like rule changes. The spike keys each queue by channel instead:

```text
'r3-fighter/attack:fighter'         [12]   // the d20 (or both dice of a pair)
'r3-fighter/attack:fighter:reroll'  [9]    // one value per reroll use
'r3-fighter/attack:fighter:bless'   [3]    // the modifier's own dice
```

Recommendation: give every die a roll id (`<stepId>/<rollTarget>[:<channel>]#<n>`), put it in the
trace, and key `forcedRolls` by it. A forced run and a seeded run then address dice identically,
which is also what the replay feature (VR-7) wants.

### 2.5 Trace volume, measured

12 rounds × 24 steps × 8 phases against a 9-rule profile: **434 events, 107 KB of JSON**
(192 `phaseStart`, 216 `rule`, 12 `roll`, 12 `compare`, 1 `effectApplied`, 1 `expiry`).
ADR-0010 already calls this "acceptable for a demo", and it is — but `phaseStart` is 44 % of the
events and carries nothing a `(stepId, phase)` group header couldn't derive. Dropping it and
defaulting `traceLevel` sensibly is worth doing before the SQLite column fills up.

---

## 3. Dice: `@dice-roller/rpg-dice-roller` is out, mulberry32 is in

Probed against v5.5.1 outside the workspace (`spike/dice-lib-probe.mjs`, no lockfile change).

**What it can do.** Seeding works and is reproducible:
`NumberGenerator.generator.engine = NumberGenerator.engines.MersenneTwister19937.seed(42)` gives
`[3, 8, 17, 15, 7]` for `1d20` every time. Exact per-die forcing is also *achievable* — a
hand-written engine `{ next: () => value - 1 }` produced the requested face for every value of
d4, d6 and d20, and for both dice of a `2d20kh1`.

**Why it is still the wrong choice here.**

1. **`NumberGenerator.generator` is a process-wide singleton** (confirmed: the instance is
   identical across imports) and seeding means mutating it. That is global mutable randomness,
   which ADR-0002 and NFR-1 rule out in so many words. It also means the two runs behind `/compare`
   (FR-16) would share one stream.
2. **No first-class forced results.** `engines.min` / `engines.max` force *all* dice to the extreme.
   The exact-forcing trick above depends on `random-js`'s `integer()` rejection mapping, which is
   not part of the dice roller's public API and can change under a patch release. Pinning golden
   tests to that is not defensible.
3. **The seam we need is inside `2d20kh1`.** §2.1 requires intervening between rolling the pair and
   keeping one of them; the library's keep-highest modifier is exactly the step that hides it.
   We would be using it only as a d20 source anyway.
4. **Weight.** 21 MB installed, 17 MB of it `mathjs`, for a dice-expression parser the engine does
   not need — against NFR-3 (runs in the browser).

**Replacement**: `spike/rng.ts`, ~40 lines, no dependencies — FNV-1a to turn the human-readable
`seed` string into a `u32`, mulberry32 for the stream, and a `Roller` that logs every die and pops
from a forced queue when one is present. Injected per evaluation, never global. Caveats to carry
forward: mulberry32 is not cryptographic (irrelevant here), and the seed → stream mapping is part
of the reproducibility contract, so it must be pinned and any change must bump `engineVersion`
(VR-7 already stores it).

No dependency was added, so `CREDITS.md` needs no change.

---

## 4. What the spike did *not* prove

- **JSON Logic — the biggest remaining risk.** Conditions here are TypeScript predicates with a
  `v(f, path, value)` helper that records the read. Two things ADR-0010 assumes are untested:
  recording facts read (needs a wrapped `var` operation) and `conditionFalse.failedAt` as a JSON
  pointer into the condition tree. `json-logic-js` returns a bare boolean and exposes no hook for
  either, so this means a wrapper or a fork. Spike it before M1 commits to the library.
- Concentration (Bless's real duration is *Concentration, up to 1 minute*; the spike models only
  the time span), the damage pipeline, crits, resistance, saving throws, initiative and surprise.
- ADR-0009 beyond `add` / `override` / `disable`: the `patch` whitelist and the `Conflict` list
  were not exercised.
- Fixture derivation (ADR-0006) in anger — the spike derives attack bonus from raw scores and
  proficiency, which is the shape ADR-0006 asks for, but AC, save DCs and damage were not touched.
- 5.1 vs 5.2.1 Bless wording differs slightly: 5.1 says the target "can roll a d4 and add", 5.2.1
  says the target "adds 1d4". Modelled as mandatory in both; if that is wrong it becomes another
  intent.

---

## 5. Actions

Written up as ADRs, all accepted on 2026-09-21:

| ADR | Settles | Supersedes / amends |
| --- | --- | --- |
| [ADR-0011](adr/0011-roll-transform-order.md) — transforms act on the dice pool, die chosen in `intents` | Q13 | supersedes ADR-0008 |
| [ADR-0012](adr/0012-duration-anchors.md) — every time-span duration names an anchor turn and an edge | Q14 | supersedes ADR-0007 |
| [ADR-0013](adr/0013-condition-evaluator.md) — own the condition evaluator, keep JSON Logic as the syntax | Q15 | amends ADR-0001 |

The trace event deltas in §2.3 became [ADR-0014](adr/0014-trace-events.md), also accepted
(`effectApplied`, `compare`, `dieIndex`, `diceAfterTransforms`, `rolled`, `stacking` scoped to
non-roll targets, `phaseStart` dropped). It supersedes ADR-0010's event list. It answers no open
question — it corrects a schema nothing had implemented yet.

**Docs brought in line with ADR-0011 to ADR-0013** (2026-09-21): `architecture.md` (roll-id keying
for `forcedRolls`, the new roll order, three-way expiry, the `src/conditions/` description), the
Stack line in `CLAUDE.md`, `content-authoring.md` (condition operator table, the three effect
channels with `dieSelector`, duration anchors and the time-span convention, a `rollChoice` template
param) and `requirements.md` (FR-6, FR-13, and the ADR pointers in Core concepts). While editing
`content-authoring.md` the example rule turned out to use `phase: initiative`, which is not one of
the eight phases — corrected to `modifiers`, with a note that an initiative roll is a roll *target*
like any other.

**Confirmed, no change needed** — ADR-0002 (and it is precisely what rules out both the dice
library and `json-logic-js`'s global operation registry), ADR-0003, ADR-0005, ADR-0006, ADR-0009.

**Worth noting for the UI, not an ADR.** ADR-0003 (choices declared up front) combined with 5.2.1's
"you must use the new roll" means the engine will cheerfully reroll a 15 into a 4 because
`useInspiration: true` was declared before the dice were known. That is the correct behaviour under
the ADR and it makes a good teaching example, but `/playground` must present it as "what you
declared", never as a recommendation.
