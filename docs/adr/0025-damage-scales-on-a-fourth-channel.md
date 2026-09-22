# ADR-0025: Resistance and vulnerability scale the damage total on a fourth channel

- Status: accepted
- Date: 2026-09-22
- Amends ADR-0011 (adds a fourth channel to the three); closes Q25

## Context

Q25. "Damage dice, crits, resistance/vulnerability" is a row of the core-subset table in
`requirements.md`, which the risk register calls the scope contract. ADR-0021 unblocked
every other row and named this one as the exception it did not reach:

> Resistance and vulnerability are still not expressible — halving a total is not a modifier
> and `DamageOutcome` has no damage type to halve.

Three things are missing at once, and none of them has a decision behind it:

- **No multiplicative channel.** `addModifier` contributes a term that `resolveStack` sums.
  Halving is not a term — it does not commute with the other terms, and `AppliedModifier.value`
  is an integer.
- **No damage type.** `applyDamage` writes the literal `'untyped'`. The weapon has carried
  `damage.type` since ADR-0017, and `createFactSource` has served `action.weapon.damage.type`
  since then too, but no pack registers the path and the type never reaches the damage phase.
- **No field on the fixture.** `Actor` and `ActorFixtureData` have nowhere to record what a
  stat block prints as `Damage Resistances` / `Damage Vulnerabilities`.

The SRD text, read from both editions, is the same in each:

- 5.1 § Damage Resistance and Vulnerability: resistance halves, vulnerability doubles;
  "Resistance and then vulnerability are applied after all other modifiers to damage";
  "Multiple instances of resistance or vulnerability that affect the same damage type count
  as only one instance."
- 5.2.1 § Resistance and Vulnerability, with its **No Stacking** and **Order of Application**
  subheads: halved "(round down)", doubled, and "adjustments such as bonuses, penalties, or
  multipliers are applied first; Resistance is applied second; and Vulnerability is applied
  third."

## Options

1. **A `multiply` stacking policy.** Add a fourth `StackPolicy` and let `resolveStack`
   handle it.
   - Pros: no new effect type, no new bus lane.
   - Cons: `resolveStack` serves `roll.attack.bonus`, `actor.ac.effective` and damage alike,
     so a multiplicative policy would instantly be expressible on effective AC, which nobody
     wants and no SRD rule asks for. `AppliedModifier.value` is an integer, so a factor
     would need a second field that means something different on one policy. And the policies
     are a *set* algebra — `unique` → `highest` → sum — that a multiplier does not belong to.

2. **A factor on the effect.** `scaleDamage` carrying `{ numerator, denominator }` or a
   float.
   - Pros: general; immunity and quartering come free.
   - Cons: it puts the arithmetic in content, and the arithmetic is the part the two SRDs
     state precisely — the order, the rounding, and the no-stacking rule. Two packs would
     each restate it, and could restate it differently. It also makes "multiple instances
     count as one" unstateable: you cannot deduplicate factors that are numbers.

3. **A named scale on a fourth channel (recommended).** `scaleDamage` names *which way* the
   total bends; the engine owns the order, the rounding and the collapse.
   - Pros: it is exactly ADR-0011's division of labour, and exactly the shape of the
     roll-mode channel, which also has content naming a direction (`advantage`) and the
     engine owning the algorithm. A rule says what the SRD says — "resistance applies" —
     and cannot get the halving wrong.
   - Cons: the vocabulary is closed, so immunity needs a schema change rather than a number.

## Decision

Option 3, in three parts.

**A fourth channel.** A `scaleDamage` effect takes a `RollTargetRef` and a
`scale: 'resistance' | 'vulnerability'`. Handlers record grants on a new `StepBus` lane,
uncollapsed, exactly as `rollMode` records every advantage grant. `totalDamage` resolves them
*after* `resolveStack`:

```
total → resistance ? floor(total / 2) : total → vulnerability ? × 2 : × 1
```

Multiple grants of one scale count as one. The two do **not** cancel: 9 damage against a
creature with both is 8. That asymmetry is why this is not the roll-mode algorithm however
much it resembles it, and it is tested as such. `resolveStack` stays integer and additive for
every target it serves.

**A real damage type.** `totalDamage` reads the step's type from the weapon the situation
inlined — `items[action.weapon].damage.type` — and `'untyped'` for an unarmed attack or a
weapon that deals no damage of its own. It reaches `applyDamage`, so `DamageOutcome.damageType`
stops being a literal. Both packs register `action.weapon.damage.type`, which the fact source
already served. One type per step; mixed-type damage is outside the core subset (ADR-0003).

**A field on the fixture.** `Actor` and `ActorFixtureData` gain `resistances: string[]` and
`vulnerabilities: string[]`, damage type names as the rules read them. `normalizeFixture`
defaults both to `[]`, so a stat block that prints neither authors neither — the courtesy an
item's `properties` and `mastery` already get. `createFactSource` serves them beside
`conditions`, so a rule reads `target.resistances`; both packs register the two paths as
`stringList`.

They are printed values and nothing writes them, which is the one place they differ from
`conditions`: a rule reads the list and grants the scale, and a spell that conferred
resistance would need its own decision.

**Trace.** A `damageScale` event in the `damage` phase, emitted only when something scaled,
carrying `damageType`, every grant, and `before`/`after`. The `stacking` event stays honestly
additive.

Immunity is deliberately left out. The channel would admit it as a third member, but the
core-subset table names resistance and vulnerability and that table is the scope contract.

## Consequences

- `SITUATION_SCHEMA_VERSION` goes to 3 and `TRACE_SCHEMA_VERSION` to 3 — the latter shared
  with ADR-0023. Nothing is persisted yet, so both are corrections before first persistence,
  as ADR-0019 and ADR-0021 were.
- The last row of the core-subset table becomes authorable. `requirements.md` gains **FR-21**
  and FR-7's channel list goes from three to four.
- Content: `damage.resistance` and `damage.vulnerability` in both packs, and three new
  fixtures — the SRD Awakened Shrub (resistant to piercing, vulnerable to fire, one fixture
  for both editions), the Skeleton (vulnerable to bludgeoning, two fixtures because AC and
  Dexterity differ between editions) and a mace, which is the only bludgeoning weapon in
  `content/` and so the only thing the skeleton's vulnerability could fire against.
- Every existing golden trace gains two more `rule` events per damage phase, because FR-14
  records every selected rule whether or not it fired. No existing outcome changed.
- A creature can now be resistant to a type no weapon in `content/` deals — the shrub's
  vulnerability to fire is exactly that. It lints clean and never fires, which is correct:
  the fixture states the stat block, not the scenario.
- What this does *not* settle: granting resistance from a rule (a spell, a rage) would need
  a writable channel, and `parseWritablePath` still refuses it. No question is raised for it,
  because nothing in the core subset asks.
