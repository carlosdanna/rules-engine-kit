# ADR-0021: An effect's value may read a fact, and a step's roll result is one

- Status: accepted
- Date: 2026-09-22

## Context

Q21, plus a second gap found beside it while writing the SRD packs for M2.

Q21 as logged: a rule can *read* a weapon's dice (`action.weapon.damage.dice`, ADR-0017) but
`rollDice.expr` is a literal `DiceExpr`, so an effect cannot use what a condition read. The
same sentence is true of `addModifier`: `ModifierValue` is `number | DiceExpr`. That is worse
than the damage case it was filed for, because it reaches the most ordinary rule in the
system. FR-8 says fixtures hold printed values and "ability modifiers come from the fact
registry", but `attack.ability-modifier` cannot add `actor.abilityMod.str` — it can only add
a literal. The golden fixture pack writes `value: 3` and says so in an interpretation note;
real content in `content/` cannot, because a pack is written once and run against every
fixture.

The second gap is the same shape. All eight SRD 5.2.1 mastery properties trigger on "if you
hit" or "on a miss", and both SRDs state a Critical Hit as rolling the attack's damage dice
again. Nothing exposes either fact: `compareAction` returns its result to the phase loop,
which puts it in the outcome and the trace, and the store never sees it. So a `damage`- or
`apply`-phase rule cannot know what the `compare` phase just decided, even though the phases
exist precisely so that a later one can see what an earlier one did (FR-9, ADR-0012).

Both gaps are the engine holding a value that content legitimately needs, so they are
decided together.

## Options

1. **Per-fixture or per-weapon rule bodies.** Write `attack.ability-modifier.str-16`, or a
   damage rule per weapon, with the number inline.
   - Pros: no engine change.
   - Cons: content becomes a function of the fixtures it was written against, which is
     exactly what FR-8 forbids; the version diff (VR-9) fills with numbers instead of rules;
     a new fixture means new rules.

2. **A fact-reference value form, and result facts (recommended).** An effect's value may be
   `{ fact: <registered path> }`, resolved when the effect is applied. The step's roll
   result becomes readable through the fact source once the `compare` phase has run.
   - Pros: one form answers both halves of Q21 and the mastery/crit gap; the registry keeps
     its job as the single list of what content may read; the trace can name the path a
     number came from, so "+3 ability" stays explainable (FR-14).
   - Cons: an effect can now fail at apply time on a path that lints clean — a registered
     path whose *value* is the wrong shape. That failure is an error, not a silent zero.

3. **A general expression language in effect values.** `value: "actor.abilityMod.str + 2"`.
   - Pros: most expressive.
   - Cons: a second evaluator beside ADR-0013's, with its own type errors, its own lint and
     its own trace story; and a flat `+ 2` inside an expression bypasses the stacking policy
     the `addModifier` channel exists to apply (FR-11, ADR-0011).

## Decision

Option 2, in two parts.

**A value may read a fact.** `ModifierValue` gains `{ fact: string }`, and so does
`rollDice.expr`. It is resolved in the effects layer — not in `src/stacking/`, which stays
pure and roller-free — through the same `FactSource` conditions read, when the effect is
applied:

- a `number` becomes a flat modifier;
- a dice-notation string (`"1d8"` — what `action.weapon.damage.dice` returns) is parsed with
  the existing `parseDiceNotation` and rolled on the modifier's own channel;
- notation carrying a flat bonus (`"1d8+2"`) is rejected, for the reason
  `content-authoring.md` already gives for authored dice: the `+2` would reach the roll
  without passing through the `addModifier` channel and so could never have a policy applied;
- anything else is an `EffectApplicationError` — the error effects already raise — under a
  new reason naming the rule, the effect, the path and the value it read.

A derived path read from an effect throws `derived-not-sealed` exactly as it does from a
condition. That is intended: an effect that contributes to a total during `modifiers` must
not read a total the same phase is still assembling.

**A step's roll result is a fact.** After `compare`, three paths resolve:
`step.attack.result` (`hit`/`miss`/`success`/`failure`), `step.attack.natural` (the kept
die, before modifiers) and `step.attack.total`. Read before the `compare` phase they throw
`FactResolutionError { kind: 'result-not-decided' }` rather than returning `null`, on
ADR-0013's principle: a value that does not exist yet is an error, never a silent absence.
The name is `step.attack.*` for all three roll kinds, because the step has one d20 and the
`attack` in the path names the step's action, not the roll's kind — a check's result is
`step.attack.result` = `success`, which the fact's description says.

`AppliedModifier` gains an optional `fromFact`, so a trace can show that `+3 ability` came
from `actor.abilityMod.str`. `TRACE_SCHEMA_VERSION` goes to 2: the field is additive and
optional, but ADR-0019 treats the trace envelope as versioned and a viewer may key on it.

## Consequences

- `content:lint` checks an effect's `{ fact }` path against the pack's registry and reports
  an unregistered one as `unknown-fact`, the same guarantee `lintCondition` gives conditions
  (FR-17). Lint and evaluation still walk one registry, so a path that lints cannot be
  missing at run time.
- `EffectContext` gains `readFact`. The engine core stays pure: the fact source is the one
  the phase loop already built, and nothing new touches `fs`, a clock or randomness
  (ADR-0002, NFR-1).
- The SRD packs can now state what the SRD states: an attack adds the ability modifier used
  to make it, a weapon deals its own dice, a critical hit rolls those dice again, and Sap
  applies "if you hit". None of those numbers appears in a rule body.
- Resistance and vulnerability are still not expressible — halving a total is not a modifier
  and `DamageOutcome` has no damage type to halve. That is Q25, and it is the one row of the
  core-subset table this ADR does not unblock.
- The two existing golden cases' `trace.snap.txt` change with the schema-version bump. Their
  `expected.json` files do not, which is the asymmetry `cases/README.md` describes and
  ADR-0019 asked for.
