# ADR-0008: Three separate roll channels; rerolls are a transform, not a mode

- Status: superseded by ADR-0011
- Date: 2026-09-21

## Context
Q4. Two things a rule can do to a d20 look similar but combine differently: adding a number (Bless, proficiency, cover) and changing how the die is rolled (advantage, disadvantage, reroll). FR-11 asks for per-type stacking policies *and* advantage/disadvantage cancelling, which are different algorithms. The 5.1-vs-5.2.1 Inspiration acceptance scenario needs the same `rule_key` to grant advantage on one profile and a reroll on the other, so both must be first-class.

## Options

1. **One `modifier` effect with a kind union.** Numeric and roll-mode contributions share a type and a stacking pass.
   - Pros: one effect type, one registry entry.
   - Cons: forces `policy: 'sum'` and "advantage and disadvantage cancel" into the same code path; the trace cannot cleanly say why a numeric bonus was dropped versus why advantage cancelled.

2. **Three channels per roll target (recommended).** A roll collects, independently: numeric **modifiers** (subject to stacking policies), a **roll mode** (advantage/disadvantage grants, cancelling to normal if both are present), and **roll transforms** (reroll, minimum die, replace result). They are resolved in a fixed order and each channel is traced separately.
   - Pros: each channel gets the algorithm it actually needs; Inspiration differs between editions by switching effect type, not rule key; the trace reads like the rules text.
   - Cons: three effect types instead of one.

3. **Effects as arbitrary state patches.** Rules write wherever they like.
   - Pros: maximum flexibility, no catalogue to maintain.
   - Cons: unexplainable and undiffable; defeats the point of the project.

```ts
type Effect =
  | { type: 'setValue'; path: string; value: Json }
  | { type: 'addModifier'; target: string; value: number | DiceExpr;
      modifierType: string; stackKey?: string; policy: 'sum' | 'highest' | 'unique' }
  | { type: 'rollMode'; target: RollTarget; mode: 'advantage' | 'disadvantage' }
  | { type: 'rollTransform'; target: RollTarget; transform: RollTransform; uses: number }
  | { type: 'rollDice'; expr: DiceExpr; into: string }
  | { type: 'applyCondition'; actorId: string; condition: string; duration: Duration }
  | { type: 'removeCondition'; actorId: string; condition: string }
  | { type: 'emitEvent'; event: string; data?: Json }
  | { type: 'halt'; reason: string };

type RollTransform =
  | { kind: 'reroll'; keep: 'new' | 'higher' }     // Heroic Inspiration: keep 'new'
  | { kind: 'minimumDie'; value: number }          // e.g. treat a d20 below N as N
  | { kind: 'replaceDie'; value: number };

// Resolution order inside the `roll` phase, per target:
//   1. roll mode: any advantage + any disadvantage -> normal; else advantage/disadvantage
//   2. roll the die (or the pair, keeping high/low); forced rolls substitute here
//   3. roll transforms, in rule priority order, each consuming one use, applied to the kept die
//   4. numeric modifiers, combined by their stacking policies, added to the kept die
```

## Decision
Option 2. `rollMode` and `rollTransform` are separate effect types from `addModifier`, and a roll resolves mode → die → transforms → modifiers. Advantage and disadvantage cancel regardless of how many of each are present (SRD 5.1 and 5.2.1 agree). A reroll applies to the already-kept d20 result and, for Heroic Inspiration, the new roll stands — a rule may instead ask to keep the higher of the two.

## Consequences
- `src/stacking/` handles only numeric modifiers; mode cancelling and transforms live with the roll resolution in `src/dice/` and `src/evaluator/`.
- `content-authoring.md`'s effect list and the Core-concepts effect row in `requirements.md` name the three channels explicitly.
- `forcedRolls` must supply both dice of an advantage pair, and a further value per reroll use, so tests can pin every die.
- The trace's `roll` event shows mode inputs and the cancel decision, each transform that fired, and every modifier term (ADR-0010).
- Property tests: mode cancelling is idempotent and order-independent; transforms never run more than `uses` times.
