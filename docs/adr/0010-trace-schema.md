# ADR-0010: Flat, versioned trace events; "why not" is a lookup, not a re-run

- Status: superseded by ADR-0014
- Date: 2026-09-21

## Context
Q6. The trace is the product: FR-14 wants per-rule status, facts read and state delta; FR-15 wants "why / why not" for any rule; FR-16 wants two runs diffed; NFR-7 wants JSON export and a narrative rendering. The shape has to serve all four, and it has to snapshot cleanly in golden tests without churning on unrelated changes.

## Options

1. **Free-form log lines.** Human-readable strings appended as evaluation proceeds.
   - Pros: no schema work.
   - Cons: not diffable, not queryable, and "why not" becomes string matching.

2. **Flat ordered array of discriminated-union events (recommended).** Every event carries `seq`, `stepId`, `round` and `phase`, so the viewer can group them into a step → phase → rule tree while the diff aligns two runs on `(stepId, phase, ruleKey)`. The array is stamped with `traceSchemaVersion`.
   - Pros: one structure serves export, narrative rendering, explanation and diff; stable ordering makes snapshots quiet.
   - Cons: the renderer has to rebuild the grouping the tree would have given it for free.

3. **Nested tree mirroring step → phase → rule.** The trace is the render structure.
   - Pros: easiest to display.
   - Cons: diffing and snapshotting nested structures is noisier, and appending an event means finding its parent.

```ts
type TraceEventBase = { seq: number; stepId: string; round: number; phase: Phase };
type FactRead = { path: string; value: Json };

type TraceEvent =
  | (TraceEventBase & { kind: 'phaseStart' })
  | (TraceEventBase & {
      kind: 'rule';
      ruleKey: string;
      status: 'fired' | 'skipped' | 'disabled';
      reason?: SkipReason;
      conditionResult: boolean | null;
      factsRead: FactRead[];
      deltas: StateDelta[];
      citation: Citation;
      provenance: { layer: string; version: string };
    })
  | (TraceEventBase & {
      kind: 'roll';
      target: RollTarget; mode: 'normal' | 'advantage' | 'disadvantage';
      modeInputs: { ruleKey: string; mode: 'advantage' | 'disadvantage' }[];
      dice: number[]; kept: number; forced: boolean;
      transforms: { ruleKey: string; kind: string; from: number; to: number }[];
      modifiers: { ruleKey: string; modifierType: string; value: number; applied: boolean }[];
      total: number;
    })
  | (TraceEventBase & {
      kind: 'stacking'; target: string;
      applied: AppliedModifier[];
      dropped: { modifier: AppliedModifier; policy: string; beatenBy?: string }[];
    })
  | (TraceEventBase & { kind: 'expiry'; effectId: string; sourceRuleKey: string; expiresAt: TimePoint })
  | (TraceEventBase & { kind: 'event'; event: string; data?: Json });

type SkipReason =
  | { kind: 'conditionFalse'; failedAt: string }         // JSON pointer into the condition tree
  | { kind: 'disabledByLayer'; layer: string }
  | { kind: 'supersededByLayer'; layer: string }
  | { kind: 'haltedEarlier'; byRuleKey: string };

type Trace = { traceSchemaVersion: number; events: TraceEvent[] };

type Explanation = {
  ruleKey: string;
  inProfile: boolean;                                    // false answers "why not" on its own
  citation?: Citation;
  occurrences: { stepId: string; phase: Phase; status: 'fired' | 'skipped' | 'disabled';
                 reason?: SkipReason; factsRead: FactRead[] }[];
  narrative: string;
};
```

The load-bearing rule: **every enabled rule selected for a phase emits exactly one `rule` event, whether or not it fired**, with the facts it read and, when skipped, the sub-condition that failed. `explain()` then reads the trace rather than re-evaluating anything, so an explanation can never disagree with the run it describes. A rule key absent from the resolved profile is reported via `inProfile: false`.

## Decision
Option 2. A trace is `{ traceSchemaVersion, events }` — a flat, ordered array of discriminated-union events, each carrying step, round and phase. Considered-but-not-fired rules are recorded, and `explain()` is a pure lookup over the trace.

## Consequences
- Traces are large: every rule in the profile produces an event per step and phase it is selected for. Acceptable for a demo; `evaluate` takes `traceLevel: 'full' | 'fired-only'`, defaulting to `full`, and the DB stores what was produced.
- `traceSchemaVersion` is stored per evaluation (VR-7); the viewer refuses to render a newer version than it knows.
- Golden tests assert outcomes separately from trace snapshots, per the risk table, and only the `seq` ordering plus event kinds are treated as stable contract.
- `src/trace/` owns both the event types and the narrative renderer; `src/diff/` aligns two traces on `(stepId, phase, ruleKey)`.
- `conditionFalse.failedAt` requires the JSON Logic wrapper to report which sub-expression failed, not just a boolean.
