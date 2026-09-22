/**
 * Assembles the flat, ordered event array a `Trace` is (ADR-0010, ADR-0014).
 *
 * `seq` is assigned here rather than by the emitters. That is not just convenience:
 * `Omit<TraceEvent, 'seq'>` collapses the discriminated union to its shared keys, so an
 * emitter typed that way can see almost nothing. `TraceEventInput` (schema/trace.ts) is the
 * distributive form, and centralising the counter means nothing else has to touch it.
 */

import type { Trace, TraceEvent, TraceEventInput } from '../schema';
import { TRACE_SCHEMA_VERSION } from '../version';

/** `fired-only` keeps the trace small for a stored run; `full` is what `explain()` needs. */
export type TraceLevel = 'full' | 'fired-only';

export type TraceBuilder = {
  push(event: TraceEventInput): void;
  pushAll(events: readonly TraceEventInput[]): void;
  build(): Trace;
  readonly level: TraceLevel;
};

export function createTraceBuilder(options?: { level?: TraceLevel }): TraceBuilder {
  const level = options?.level ?? 'full';
  const events: TraceEvent[] = [];
  let seq = 0;

  function keep(event: TraceEventInput): boolean {
    // Only per-rule noise is dropped. Rolls, comparisons, stacking and expiries are what
    // happened, not what was considered, so a `fired-only` trace still narrates a run.
    return level === 'full' || event.kind !== 'rule' || event.status === 'fired';
  }

  return {
    level,
    push(event) {
      if (!keep(event)) return;
      // `seq` counts what was kept, so it stays dense and a viewer can index by it.
      events.push({ ...event, seq } as TraceEvent);
      seq += 1;
    },
    pushAll(next) {
      for (const event of next) this.push(event);
    },
    build: () => ({ traceSchemaVersion: TRACE_SCHEMA_VERSION, events }),
  };
}
