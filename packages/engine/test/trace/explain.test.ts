import { describe, expect, it } from 'vitest';
import { Explanation } from '../../src/schema';
import { createTraceBuilder, explain } from '../../src/trace';
import { citation, ruleEvent } from './fixtures';

const RULE = 'condition.prone.attacked-within-5ft';

function traceOf(...events: Parameters<ReturnType<typeof createTraceBuilder>['push']>[0][]) {
  const builder = createTraceBuilder();
  builder.pushAll(events);
  return builder.build();
}

describe('explain — why (FR-15)', () => {
  const trace = traceOf(
    ruleEvent({
      stepId: 'r1-fighter',
      factsRead: [{ path: 'actor.conditions', value: ['prone'] }],
    }),
    ruleEvent({ stepId: 'r2-fighter', round: 2 }),
  );

  it('reports the rule as in profile with one occurrence per rule event', () => {
    const explanation = explain(trace, RULE);
    expect(explanation.inProfile).toBe(true);
    expect(explanation.occurrences).toHaveLength(2);
    expect(explanation.occurrences.map((o) => o.stepId)).toEqual(['r1-fighter', 'r2-fighter']);
  });

  it('carries the citation so the answer can point at the SRD', () => {
    expect(explain(trace, RULE).citation).toEqual(citation);
  });

  it('carries the facts the condition actually read, in read order (FR-14)', () => {
    expect(explain(trace, RULE).occurrences[0]?.factsRead).toEqual([
      { path: 'actor.conditions', value: ['prone'] },
    ]);
  });

  it('counts how often it fired', () => {
    expect(explain(trace, RULE).narrative).toContain(`'${RULE}' fired 2 of 2 times.`);
  });

  it('produces an Explanation that parses against the schema', () => {
    expect(() => Explanation.parse(explain(trace, RULE))).not.toThrow();
  });
});

describe('explain — why not (FR-15)', () => {
  it('names the sub-condition that failed', () => {
    const trace = traceOf(
      ruleEvent({
        status: 'skipped',
        conditionResult: false,
        reason: { kind: 'conditionFalse', failedAt: '/all/1/<=' },
      }),
    );
    const explanation = explain(trace, RULE);
    expect(explanation.occurrences[0]?.reason).toEqual({
      kind: 'conditionFalse',
      failedAt: '/all/1/<=',
    });
    expect(explanation.narrative).toContain('condition false at /all/1/<=');
  });

  it('names the layer that disabled the rule (ADR-0009)', () => {
    const trace = traceOf(
      ruleEvent({
        status: 'disabled',
        conditionResult: null,
        reason: { kind: 'disabledByLayer', layer: 'house-rules' },
      }),
    );
    expect(explain(trace, RULE).narrative).toContain("disabled by layer 'house-rules'");
  });

  it('names the rule that halted the step', () => {
    const trace = traceOf(
      ruleEvent({
        phase: 'damage',
        status: 'skipped',
        conditionResult: null,
        reason: { kind: 'haltedEarlier', byRuleKey: 'combat.surprise' },
      }),
    );
    expect(explain(trace, RULE).narrative).toContain("'combat.surprise' halted the step");
  });
});

describe('explain — a rule with no events (FR-15, ADR-0010)', () => {
  const explanation = explain(traceOf(ruleEvent()), 'never.mentioned');

  it('reports inProfile false with no occurrences and no citation', () => {
    expect(explanation.inProfile).toBe(false);
    expect(explanation.occurrences).toEqual([]);
    expect('citation' in explanation).toBe(false);
  });

  it('says that a fired-only trace is the other explanation for the absence', () => {
    // `inProfile` is inferred from absence, and `fired-only` omits exactly the events this
    // lookup depends on. The narrative is the only place that caveat can be recorded.
    expect(explanation.narrative).toContain("traceLevel 'fired-only'");
    expect(explanation.narrative).toContain('not in the resolved profile');
  });
});
