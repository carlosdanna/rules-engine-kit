# ADR-0011: Roll transforms act on the dice pool, and the die is chosen in `intents`

- Status: accepted
- Date: 2026-09-21
- Supersedes ADR-0008 (resolution order and the `rollTransform` shape only)

## Context

Q13. ADR-0008 established three roll channels — that decision holds and the spike confirmed it —
but it also fixed the resolution order as *mode → roll the die (or the pair, keeping high/low) →
transforms applied to the kept die → modifiers*. Both SRDs contradict that ordering:

> When you have Advantage or Disadvantage and something in the game lets you reroll or replace the
> d20, you can reroll or replace only one die, not both. You choose which one.
> — SRD 5.2.1, *Playing the Game > Interactions with Rerolls*

> When you have advantage or disadvantage and something in the game … lets you reroll the d20, you
> can reroll only one of the dice. You choose which one.
> — SRD 5.1, *Using Ability Scores > Advantage and Disadvantage*

The reroll happens **inside the pair, before the keep**, and **which die** is a player choice.
`docs/spike-notes.md` §2.1 shows the divergence is observable, not cosmetic — melee attack on a
prone target (advantage), forced pair `(4, 16)`, Heroic Inspiration rerolls the 4 into `11`, AC 20:

| Order | Arithmetic | Result |
| --- | --- | --- |
| SRD: reroll die 0 → `(11, 16)` → keep 16 | 16 + 5 = 21 | hit |
| ADR-0008: keep 16 → reroll it → 11 | 11 + 5 = 16 | miss |

This is exactly the acceptance scenario "Spend inspiration on an attack" crossed with "Melee vs
prone", so the demo hits it immediately. ADR-0003 forbids pausing for input, so the die choice has
to be declared up front — which means `situation.intents` needs a shape for per-roll choices, and
that shape is the second half of this decision.

## Options

1. **Keep ADR-0008's order.** Transforms apply to the already-kept die.
   - Pros: only ever one die to reason about; no selector to plumb through rules, intents,
     templates and forced rolls; the trace's `roll` event stays flat.
   - Cons: contradicts both SRDs in the one case the acceptance scenarios exercise, and produces a
     different hit/miss. Wrong is worse than simple for a project whose product is the explanation.

2. **Transforms act on the pool before the keep; the die is named in `intents` (recommended).**
   - Pros: matches both SRDs; keeps the choice where ADR-0003 puts every other choice; the trace can
     say which die was rerolled and what the pool looked like before the keep.
   - Cons: `intents` grows a per-roll keyed structure; `Situation` schema version bumps; a rule's
     transform now depends on data outside the rule.

3. **Transforms act on the pool, but the engine picks the die by a policy** (e.g. reroll the lowest).
   - Pros: no intent plumbing; the demo always plays "correctly".
   - Cons: there is no correct policy. 5.2.1's *"you must use the new roll"* means the best die to
     reroll depends on dice not yet rolled, so any policy is a guess. It also invents a decision the
     SRD hands to the player, and the trace would have to explain a choice nobody made.

```ts
type RollTransform =
  | { kind: 'reroll'; keep: 'new' | 'higher' }   // Heroic Inspiration: keep 'new'
  | { kind: 'minimumDie'; value: number }
  | { kind: 'replaceDie'; value: number };

type DieSelector =
  | { kind: 'fixed'; index: number }             // rules that name a die themselves
  | { kind: 'intent' };                          // the player chose; look it up by roll id

type Effect =
  // …unchanged channels from ADR-0008…
  | { type: 'rollTransform'; target: RollTarget; transform: RollTransform;
      uses: number; dieSelector: DieSelector };

/** Every die the engine rolls has an id; the trace, `forcedRolls` and `intents` all use it. */
type RollId = string;                            // `${stepId}/${rollTarget}` (+ `:${channel}`)

type Intents = {
  [key: string]: unknown;
  rollChoices?: Record<RollId, { rerollDieIndex?: number }>;
};
```

Resolution order inside the `roll` phase, per target:

```text
1. roll mode    any advantage + any disadvantage -> normal; else advantage/disadvantage
2. dice pool    1 die if normal, 2 otherwise; forced rolls substitute here
3. transforms   in rule priority order, each consuming one use, applied to the die named by the
                rule's selector (an 'intent' selector reads intents.rollChoices[rollId], default 0)
4. keep         max / min / the only die
5. modifiers    numeric, combined by their stacking policies, added to the kept die
```

## Decision

Option 2. Roll transforms act on the dice pool before the keep, not on the kept die. Which die a
transform touches comes from the rule when the rule knows (`fixed`) and otherwise from
`situation.intents.rollChoices`, keyed by the same roll id the trace and `forcedRolls` use. Steps
1, 2, 4 and 5 of ADR-0008's order, and its three-channel split, are unchanged.

## Consequences

- ADR-0008 is superseded. Its core decision — `rollMode`, `rollTransform` and `addModifier` as three
  channels with their own algorithms — stands and is confirmed by the spike; only the ordering and
  the `rollTransform` shape change.
- `Situation` gains `intents.rollChoices` ⇒ `schemaVersion` bump and a migration path for saved user
  scenarios (VR-8). `renderTemplate` must be able to emit roll choices, so `content-authoring.md`
  needs a param type for them.
- Roll ids become load-bearing: they key the trace, `forcedRolls` (see `architecture.md`, which
  currently keys forced rolls by step id alone) and `intents.rollChoices`. They must be derivable
  from the situation alone, before evaluation, or a template cannot pre-declare a choice.
- The `roll` trace event must carry the pool before and after transforms, the kept index, and a
  `dieIndex` on each transform — otherwise a viewer cannot show which die was rerolled. Done in
  ADR-0014.
- `content-authoring.md`'s effect list gains `dieSelector`; `content:lint` (FR-17) should warn when a
  profile can produce an `intent` selector for which no choice is declared, since the default of 0
  is a silent decision.
- Tests: property test that transforms never run more than `uses` times and that an out-of-range
  selector clamps visibly (the clamp is traced, not swallowed); golden test for the table above.
