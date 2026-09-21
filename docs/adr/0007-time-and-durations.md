# ADR-0007: Time is (round, step); durations are resolved expiry anchors

- Status: accepted
- Date: 2026-09-21

## Context
Q3. SRD durations are written relative to a creature's turn ("until the start of your next turn", "until the end of your next turn", "1 minute"). We need a time shape that can express those exactly, and a single answer to when a duration is checked, so that the same situation always expires the same effect at the same moment.

## Options

1. **Round counter only.** Effects carry `roundsRemaining`, decremented once per round.
   - Pros: trivial.
   - Cons: cannot distinguish start-of-turn from end-of-turn expiry, which is exactly the distinction prone, Bless and Heroic Inspiration demos rest on.

2. **Countdown per turn.** Effects carry a counter decremented at each affected actor's turn.
   - Pros: matches how people play at the table.
   - Cons: the result depends on the order counters are decremented in, so it is fiddly to explain and easy to get subtly wrong across layers.

3. **Ordered `(round, step)` time with resolved expiry anchors (recommended).** Time is a position in the timeline from ADR-0005. A duration is declared relative to an actor's turn edge and is resolved to a concrete `TimePoint` at the moment it is applied. Expiry is then a comparison, not a decrement, so it is order-independent and the trace can state up front when the effect will end.

```ts
type TimePoint = { round: number; stepIndex: number; edge: 'start' | 'end' };

type Duration =
  | { kind: 'instant' }
  | { kind: 'untilTurn'; actorId: string; edge: 'start' | 'end'; afterRounds: number } // 0 = this turn
  | { kind: 'rounds'; rounds: number }          // e.g. Bless: 10 rounds from application
  | { kind: 'permanent' };

type ActiveEffect = {
  id: string;
  sourceRuleKey: string;
  actorId: string;
  duration: Duration;
  appliedAt: TimePoint;
  expiresAt: TimePoint | null;                  // resolved on application; null = permanent
};
```

Phase order per step becomes `upkeep → declare → modifiers → roll → compare → damage → apply → expire`. `upkeep` removes effects whose `expiresAt.edge` is `start` and whose point has been reached; `expire` does the same for `end`. Nothing else removes effects by time.

## Decision
Option 3. Time is an ordered `(round, stepIndex, edge)` point. Durations are declared relative to a turn edge and resolved to an `expiresAt` when applied. A new `upkeep` phase leads each step and handles start-of-turn expiry; the existing `expire` phase handles end-of-turn expiry.

## Consequences
- `architecture.md` phase list and the evaluation loop gain `upkeep`; `src/time/` owns `TimePoint` comparison and anchor resolution.
- Effect application must know the current step, so the phase loop passes a time context into the effect registry.
- The trace gets an `expiry` event and can report an effect's scheduled end at the moment it is applied (ADR-0010).
- "1 minute" durations are encoded as `{ kind: 'rounds', rounds: 10 }`; the interpretation note on those rules must say so.
- Demo timelines are short, so an effect that outlives the timeline simply appears in the final state as still active.
