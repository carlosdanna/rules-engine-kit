import { describe, expect, it } from 'vitest';
import { Trace } from '../../src/schema';
import { createTraceBuilder } from '../../src/trace';
import { TRACE_SCHEMA_VERSION } from '../../src/version';
import { rollEvent, ruleEvent } from './fixtures';

describe('createTraceBuilder — seq (ADR-0014)', () => {
  it('assigns a dense, monotonic seq the emitters never touch', () => {
    const builder = createTraceBuilder();
    builder.push(ruleEvent());
    builder.push(rollEvent());
    builder.push(ruleEvent({ ruleKey: 'other' }));
    expect(builder.build().events.map((event) => event.seq)).toEqual([0, 1, 2]);
  });

  it('builds a trace that parses against the schema', () => {
    const builder = createTraceBuilder();
    builder.pushAll([ruleEvent(), rollEvent()]);
    const trace = builder.build();
    expect(trace.traceSchemaVersion).toBe(TRACE_SCHEMA_VERSION);
    expect(() => Trace.parse(trace)).not.toThrow();
  });

  it('accepts every event kind without collapsing the union', () => {
    // The ADR-0014 trap: an emitter typed `Omit<TraceEvent, 'seq'>` sees only shared keys.
    // This compiles only because `TraceEventInput` is distributive.
    const builder = createTraceBuilder();
    builder.push({ stepId: 's', round: 1, phase: 'expire', kind: 'event', event: 'x' });
    builder.push({
      stepId: 's',
      round: 1,
      phase: 'compare',
      kind: 'compare',
      rollId: null,
      target: { kind: 'attack', actorId: 'fighter' },
      total: 21,
      dc: 20,
      result: 'hit',
    });
    expect(builder.build().events).toHaveLength(2);
  });
});

describe('createTraceBuilder — traceLevel (ADR-0010)', () => {
  it("drops only non-fired rule events under 'fired-only'", () => {
    const builder = createTraceBuilder({ level: 'fired-only' });
    builder.push(ruleEvent({ status: 'fired' }));
    builder.push(ruleEvent({ status: 'skipped', conditionResult: false }));
    builder.push(ruleEvent({ status: 'disabled', conditionResult: null }));
    builder.push(rollEvent());
    const kinds = builder.build().events.map((event) => `${event.kind}`);
    expect(kinds).toEqual(['rule', 'roll']);
  });

  it('keeps seq dense over what it kept', () => {
    const builder = createTraceBuilder({ level: 'fired-only' });
    builder.push(ruleEvent({ status: 'skipped', conditionResult: false }));
    builder.push(rollEvent());
    expect(builder.build().events.map((event) => event.seq)).toEqual([0]);
  });

  it("defaults to 'full', which is what explain() needs", () => {
    expect(createTraceBuilder().level).toBe('full');
  });
});
