# ADR-0005: Unit of work is a short, pre-declared timeline of turns

- Status: accepted
- Date: 2026-09-21

## Context
Q1. A situation currently has no agreed extent. Two acceptance items force the issue: "Bless over rounds" and "effects expiring at start/end of a turn" (requirements.md, Durations). Neither can be shown if a situation resolves exactly one action. ADR-0003 rules out pausing for input, so whatever we choose must stay a single pure call.

## Options

1. **Single action.** `Situation` describes one action by one actor; `evaluate` returns one outcome.
   - Pros: smallest schema, smallest trace, trivial golden tests.
   - Cons: durations can only be reported as "will expire later", never observed expiring. Drops a scoped engine feature and one acceptance scenario.

2. **Pre-declared timeline of turns (recommended).** `Situation` carries an ordered list of steps; each step is one actor's turn with zero or one action. The engine runs the phase loop once per step and ticks time between steps. Everything is still declared up front, so evaluation never pauses.
   - Pros: durations expire inside a run and show up in the trace; still one pure function; a one-action situation is just a timeline of length 1, so the simple case stays simple.
   - Cons: trace and outcome become per-step; golden fixtures get a little larger.

3. **Resumable stepper API.** `evaluate` returns a suspended state the caller advances turn by turn.
   - Pros: closest to a real VTT; would later support reactions.
   - Cons: contradicts ADR-0003, adds a state machine and serialisation format, and buys nothing the demo needs.

```ts
type Situation = {
  schemaVersion: number;
  actors: Actor[];
  timeline: Step[];               // length 1 for a plain single-action situation
  intents: Record<string, unknown>;
};

type Step = {
  id: string;                     // stable; trace events and forced rolls address it
  round: number;
  actorId: string;                // whose turn this is
  action: Action | null;          // null = takes no action, but time still ticks
};

type Outcome = {
  steps: StepOutcome[];           // one per Step, in order
  finalState: WorldState;
  events: EmittedEvent[];
  seed: string;
  profileHash: string;
  engineVersion: string;
  traceSchemaVersion: number;
};
```

## Decision
Option 2. A situation is an ordered timeline of turns, declared up front; `evaluate` runs the phase loop per step and returns a per-step outcome plus a final state. Demo scenarios stay short (1–3 rounds).

## Consequences
- `Situation` gains `timeline`; `action` moves from the situation root onto a step. Templates (`content-authoring.md`) render a timeline, and the single-action templates emit one step.
- Trace events carry `stepId` and `round` (see ADR-0010); `forcedRolls` must be addressed per step rather than as one flat array.
- Golden tests assert a list of step outcomes; the diff in FR-16 aligns runs by step id.
- Reactions and interrupts remain out of scope — a step is atomic.
