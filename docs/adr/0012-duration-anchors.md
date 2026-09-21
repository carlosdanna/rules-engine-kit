# ADR-0012: Every time-span duration names an anchor turn and an edge

- Status: accepted
- Date: 2026-09-21
- Supersedes ADR-0007 (the `Duration` union and the expiry representation only)

## Context

Q14. ADR-0007 decided that time is an ordered `(round, stepIndex, edge)` point and that a duration
resolves to a concrete `expiresAt` when applied, so expiry is a comparison rather than a decrement.
That decision is right and the spike confirmed it. But the union it defined cannot actually be
resolved:

```ts
| { kind: 'rounds'; rounds: number }          // e.g. Bless: 10 rounds from application
```

Ten rounds of *whose* turns, ending on which *edge*? There is no answer in the value, so
`resolveExpiry` cannot produce a `TimePoint`. Modelling Bless (`docs/spike-notes.md` §2.2) forced
three separate gaps into the open:

1. **No anchor.** Bless needs the caster's turn and the end edge.
2. **No stated edge in the SRD.** Both editions define a round as "about 6 seconds" and give Bless a
   duration of "1 minute", but neither says where in round 11 a spell cast in round 1 ends. A
   convention is required, and it has to be the same for every time-span duration.
3. **`expiresAt: null` is overloaded.** It currently means both "permanent" and "the anchor turn
   falls outside the declared timeline, so this outlives the run" — and demo timelines are short, so
   the second case is common.

A fourth thing surfaced while implementing it: resolution needs the whole timeline, not just the
current step, because it has to find *the anchor actor's turn in round R + N*.

## Options

1. **Per-effect round counter, decremented once per round.**
   - Pros: no anchor needed; the value is self-contained.
   - Cons: ADR-0007 already rejected decrements as order-dependent and hard to explain; this
     reintroduces exactly that, and still cannot express "until the start of your next turn", which
     the same union has to carry.

2. **Anchor every time-span duration to an actor's turn edge, resolved against the timeline at
   application time (recommended).**
   - Pros: keeps ADR-0007's "compare, don't decrement"; one resolution path serves `rounds` and
     `untilTurn`; the trace can state the scheduled end the moment the effect lands.
   - Cons: rule authors must name an anchor, and since rules are written before any situation
     exists, the anchor has to be symbolic in YAML and resolved per evaluation.

3. **Anchor to the round only: expire at the top of round `R + N`.**
   - Pros: simplest; no actor involved.
   - Cons: wrong in a way the demo would show — a spell cast late in round 1 would visibly last less
     than a minute — and it still cannot express turn-relative durations.

```ts
type Edge = 'start' | 'end';
type TimePoint = { round: number; stepIndex: number; edge: Edge };   // unchanged

type Duration =
  | { kind: 'instant' }
  | { kind: 'untilTurn'; anchor: AnchorRef; edge: Edge; afterRounds: number }  // 0 = this turn
  | { kind: 'rounds'; rounds: number; anchor: AnchorRef; edge: Edge }
  | { kind: 'permanent' };

/** Rules are authored before a situation exists, so the anchor is symbolic in YAML. */
type AnchorRef = { kind: 'source' } | { kind: 'target' } | { kind: 'actor'; actorId: string };

type Expiry =
  | { kind: 'at'; point: TimePoint }
  | { kind: 'permanent' }
  | { kind: 'beyondTimeline'; wouldExpireInRound: number };   // anchor turn not in the timeline

type ActiveEffect = {
  id: string;
  sourceRuleKey: string;
  actorId: string;
  duration: Duration;
  appliedAt: TimePoint;
  expiresAt: Expiry;               // was `TimePoint | null`
};
```

**Convention for time spans.** A duration of *N* minutes is `{ kind: 'rounds', rounds: N * 10,
anchor: { kind: 'source' }, edge: 'end' }`: it ends at the end of the source actor's turn in round
`appliedAt.round + rounds`. Every rule using it carries an `interpretation` note saying so, because
neither SRD states the edge.

## Decision

Option 2. Every non-instant, non-permanent duration names an anchor (symbolically in content, an
actor id once resolved) and an edge, and is resolved against the timeline at application time.
`expiresAt` becomes a three-way `Expiry` so "outlives this run" is distinguishable from
"permanent". A time span of *N* minutes is *N* × 10 rounds anchored to the source actor's turn end.

## Consequences

- ADR-0007 is superseded. Its `(round, stepIndex, edge)` `TimePoint`, the `upkeep`/`expire` phase
  pair leading and closing each step, and "expiry is a comparison, not a decrement" all stand
  unchanged; only the `Duration` union and the `expiresAt` field change.
- The time context the phase loop passes into the effect registry must include the whole timeline,
  or a precomputed `actor × round → stepIndex` index built once per evaluation. `src/time/` owns it.
- **Expiry is anchored to the source, not the target, and that is observable.** In the spike's
  12-round Bless timeline the cleric casts in round 1 and acts before the fighter, so the fighter
  loses Bless *before its own turn* in round 11. Correct, and surprising enough that the `expiry`
  trace event must name the step that ended it and the narrative renderer must say whose turn it was.
- `content-authoring.md` needs the symbolic anchor syntax (`anchor: source`) next to the duration
  fields, plus the *N* minutes = *N* × 10 rounds convention and the interpretation-note requirement.
  `content:lint` (FR-17) rejects a non-instant duration with no anchor.
- `Outcome.finalState` can report `beyondTimeline` effects honestly instead of a bare `null`, which
  matters because short demo timelines produce them routinely.
- Golden test: the spike's 12-round Bless timeline — blessed rounds 1–10 total 20 and hit AC 20,
  rounds 11–12 total 17 and miss, with one `expiry` event on the caster's round-11 step.
- Concentration stays out of scope (ADR-0003). A concentration duration is modelled as its time span
  alone, and the rule's `interpretation` must say that concentration is not simulated.
