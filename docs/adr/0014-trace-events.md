# ADR-0014: Trace events for effect application, comparison and the dice pool

- Status: accepted
- Date: 2026-09-21
- Supersedes ADR-0010 (the event list only)

## Context

ADR-0010 settled the *shape* of a trace — a flat, ordered, versioned array of discriminated-union
events, one per rule considered, with `explain()` as a pure lookup over it. Nothing in the spike
argued against any of that. But the event list it sketched has holes that only showed up once three
real rules ran through it (`docs/spike-notes.md` §2.3), and ADR-0011 depends on two of them:

- **Nothing records an effect being applied.** ADR-0010 wants the trace to "report an effect's
  scheduled end at the moment it is applied", but defines only an `expiry` event. In the Bless run
  the scheduled end is known at round 1 and the expiry fires at round 11; without an application
  event those ten rounds contain no evidence that Bless is running or when it stops.
- **Nothing records a comparison.** Hit/miss lives only in the outcome, so the trace cannot narrate
  "20 vs AC 15 → hit" (NFR-7), and a trace diff cannot show that two profiles differed at the
  comparison rather than at the roll.
- **The `roll` event cannot express ADR-0011.** It carries `dice`, `kept` and transforms with
  `from`/`to`, but no die index and no post-transform pool — so a viewer cannot say *which* of two
  dice was rerolled, which is the entire point of the rule ADR-0011 was written for.
- **A dice-valued modifier loses its dice.** ADR-0008 allowed `value: number | DiceExpr` but
  ADR-0010's `roll.modifiers[]` carries only a number, so Bless renders as "+3" with no d4 behind it.
- **`phaseStart` is 44 % of the events and carries nothing.** Measured: 192 of 434 events in the
  spike's 12-round Bless run, 107 KB of JSON total.

## Options

1. **One fat event per roll.** Fold mode, dice, transforms, modifiers, stacking, DC and result into
   the `roll` event.
   - Pros: narration reads one object; fewest event kinds.
   - Cons: puts `compare`-phase data on a `roll`-phase event, which breaks the `(stepId, phase)`
     grouping the viewer and `diffTraces` are built on, and leaves nothing to emit when a comparison
     has no roll behind it (passive scores, automatic hits).

2. **Normalise.** Keep `stacking` as the one home for modifier resolution and have `roll` reference
   it by id.
   - Pros: no duplicated modifier list; one algorithm, one event.
   - Cons: rendering a roll needs a join, and a single changed modifier would surface twice in a
     trace diff. ADR-0010 chose a flat array precisely so the array could be rendered directly.

3. **Keep the flat array; add the two missing kinds, enrich `roll` so the dice pool is
   reconstructible, and scope `stacking` to non-roll targets (recommended).**
   - Pros: every event still stands alone and still carries `(seq, stepId, round, phase)`; the roll
     channel is self-contained, which is how the spike's narrative renderer actually consumed it.
   - Cons: modifier resolution appears in two event kinds depending on the target.

```ts
/** Minted before evaluation from the situation alone, so a template can pre-declare a choice. */
type RollTarget = { kind: 'attack' | 'save' | 'check' | 'initiative' | 'damage'; actorId: string };
type RollId = string;        // `${stepId}/${kind}:${actorId}` (+ `:${channel}` for reroll/modifier dice)

type TraceEventBase = { seq: number; stepId: string; round: number; phase: Phase };

type TraceEvent =
  // 'phaseStart' is gone: the phase list is fixed and every event carries its phase.
  | (TraceEventBase & { kind: 'rule'; /* …unchanged from ADR-0010… */ })
  | (TraceEventBase & {
      kind: 'roll';
      rollId: RollId;
      target: RollTarget;
      mode: 'normal' | 'advantage' | 'disadvantage';
      modeInputs: { ruleKey: string; mode: 'advantage' | 'disadvantage' }[];
      dice: number[];                 // the pool as first rolled (2 entries under adv/disadv)
      transforms: { ruleKey: string; kind: string; dieIndex: number; from: number; to: number }[];
      diceAfterTransforms: number[];  // the pool ADR-0011 keeps from
      kept: number;
      keptIndex: number;
      forced: boolean;
      modifiers: AppliedModifier[];
      dropped: { modifier: AppliedModifier; policy: StackPolicy; beatenBy?: string }[];
      total: number;
    })
  | (TraceEventBase & {
      kind: 'compare';
      rollId: RollId | null;          // null when nothing was rolled (passive score, automatic hit)
      target: RollTarget;
      total: number;
      dc: number;
      result: 'hit' | 'miss' | 'success' | 'failure';
    })
  | (TraceEventBase & {
      kind: 'stacking';               // non-roll derived values only (effective AC, damage) — ADR-0006
      target: string;
      applied: AppliedModifier[];
      dropped: { modifier: AppliedModifier; policy: StackPolicy; beatenBy?: string }[];
    })
  | (TraceEventBase & {
      kind: 'effectApplied';
      effectId: string;
      sourceRuleKey: string;
      onActorId: string;
      expiresAt: Expiry;              // ADR-0012's three-way expiry, resolved here
    })
  | (TraceEventBase & { kind: 'expiry'; effectId: string; sourceRuleKey: string; at: TimePoint })
  | (TraceEventBase & { kind: 'event'; event: string; data?: Json });

type AppliedModifier = {
  ruleKey: string;
  modifierType: string;
  stackKey?: string;
  policy: StackPolicy;
  value: number;
  rolled?: { expr: string; dice: number[] };   // present when the modifier was a DiceExpr
};
```

## Decision

Option 3. The trace gains `effectApplied` and `compare`; the `roll` event gains `rollId`,
`diceAfterTransforms`, `keptIndex` and a `dieIndex` on each transform; modifier records gain
`rolled`; `stacking` is scoped to non-roll targets; `phaseStart` is dropped. ADR-0010's structure —
flat, ordered, versioned, one event per rule considered, `explain()` as lookup — is unchanged.

## Consequences

- ADR-0010 is superseded on its event list only. Nothing is implemented yet, so this is a schema
  correction rather than a migration: `trace_schema_version` starts at **1** and no reader has to
  handle version 0.
- `RollId` becomes the join key across three places that must agree: the trace, `forcedRolls` and
  `intents.rollChoices` (both ADR-0011). `src/dice/` mints them, and they must be derivable from the
  situation before evaluation or a template cannot pre-declare a reroll choice.
- Dropping `phaseStart` removes ~44 % of events at no information cost — the phase list is fixed, so
  the viewer renders all eight headers and groups events by `(stepId, phase)`. A phase with no
  events is a phase where nothing was selected, which is what an empty group should mean.
- The viewer must tolerate a `roll` event whose `dice` has two entries but whose `mode` is `normal`:
  that cannot happen under ADR-0011, but a stored trace from a future engine version might.
- Implementation note that will bite immediately: `Omit<TraceEvent, 'seq'>` collapses the union to
  its shared keys, so an emitter typed that way sees almost nothing. Use a distributive omit, or let
  the trace builder assign `seq` rather than stripping it from the event type.
- Unchanged: outcomes are asserted separately from trace snapshots (NFR-4), and only `seq` ordering
  plus the event kinds are treated as stable contract.
