import { describe, expect, it } from 'vitest';
import { diffTraces } from '../../src/diff';
import type { TraceEventInput } from '../../src/schema';
import { createTraceBuilder } from '../../src/trace';
import { rollEvent, ruleEvent } from '../trace/fixtures';

function traceOf(...events: TraceEventInput[]) {
  const builder = createTraceBuilder();
  builder.pushAll(events);
  return builder.build();
}

const PRONE = 'condition.prone.attacked-within-5ft';
const BLESS = 'spell.bless.attack';

describe('diffTraces (FR-16)', () => {
  it('reports two equal traces as identical', () => {
    const trace = traceOf(ruleEvent(), rollEvent());
    const diff = diffTraces(trace, trace);

    expect(diff.identical).toBe(true);
    expect(diff.firedOnlyIn).toEqual({ a: [], b: [] });
    expect(diff.events.every((event) => event.fields.length === 0)).toBe(true);
  });

  it('aligns rule events on (stepId, phase, ruleKey), whatever their seq', () => {
    const a = traceOf(ruleEvent(), ruleEvent({ ruleKey: BLESS }));
    const b = traceOf(ruleEvent({ ruleKey: BLESS }), ruleEvent());

    expect(diffTraces(a, b).identical).toBe(true);
  });

  it('lists a rule that fired on one side and was skipped on the other', () => {
    const a = traceOf(ruleEvent());
    const b = traceOf(
      ruleEvent({
        status: 'skipped',
        conditionResult: false,
        reason: { kind: 'conditionFalse', failedAt: '/all/0' },
      }),
    );

    const diff = diffTraces(a, b);
    expect(diff.identical).toBe(false);
    expect(diff.firedOnlyIn.a).toEqual([
      {
        key: `r1-fighter|modifiers|${PRONE}`,
        stepId: 'r1-fighter',
        phase: 'modifiers',
        ruleKey: PRONE,
      },
    ]);
    expect(diff.firedOnlyIn.b).toEqual([]);

    const aligned = diff.events.find((event) => event.key === `r1-fighter|modifiers|${PRONE}`);
    expect(aligned?.fields).toEqual(['conditionResult', 'reason', 'status']);
  });

  it('counts a rule present on one side only as fired only there when it fired', () => {
    const diff = diffTraces(traceOf(ruleEvent()), traceOf(ruleEvent({ ruleKey: BLESS })));

    expect(diff.firedOnlyIn.a.map((rule) => rule.ruleKey)).toEqual([PRONE]);
    expect(diff.firedOnlyIn.b.map((rule) => rule.ruleKey)).toEqual([BLESS]);
    const onlyA = diff.events.find((event) => event.ruleKey === PRONE);
    expect(onlyA?.b).toBeNull();
  });

  it('does not count a rule skipped on the only side it appears', () => {
    const skipped = ruleEvent({ ruleKey: BLESS, status: 'skipped', conditionResult: false });
    const diff = diffTraces(traceOf(ruleEvent(), skipped), traceOf(ruleEvent()));

    expect(diff.firedOnlyIn).toEqual({ a: [], b: [] });
    expect(diff.identical).toBe(false);
  });

  it('aligns a roll by roll id and names the fields that differ', () => {
    const a = traceOf(rollEvent());
    const b = traceOf(
      rollEvent({ dice: [4, 19], diceAfterTransforms: [4, 19], kept: 19, total: 19 }),
    );

    const diff = diffTraces(a, b);
    expect(diff.events).toHaveLength(1);
    expect(diff.events[0]).toMatchObject({
      key: 'r1-fighter|roll|roll|r1-fighter/attack:fighter',
      kind: 'roll',
      fields: ['dice', 'diceAfterTransforms', 'kept', 'total'],
    });
  });

  it('keeps events in step and phase order across both sides', () => {
    const a = traceOf(ruleEvent({ stepId: 'r2-fighter', round: 2 }));
    const b = traceOf(
      ruleEvent({ phase: 'declare' }),
      ruleEvent({ stepId: 'r2-fighter', round: 2 }),
    );

    expect(diffTraces(a, b).events.map((event) => event.key)).toEqual([
      `r1-fighter|declare|${PRONE}`,
      `r2-fighter|modifiers|${PRONE}`,
    ]);
  });
});
