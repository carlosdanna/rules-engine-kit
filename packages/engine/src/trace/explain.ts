/**
 * "Why / why not" for one rule (FR-15), by lookup over a stored trace.
 *
 * Never re-evaluates. Every enabled rule selected for a phase emits exactly one `rule`
 * event whether or not it fired (ADR-0010), so the trace already holds the answer — and an
 * explanation derived from it can never disagree with the run it describes, which one
 * derived by replaying could.
 */

import type { Explanation, SkipReason, TraceEvent } from '../schema';
import { eventsForRule } from './events';

function describeSkip(reason: SkipReason | undefined): string {
  if (reason === undefined) return 'did not fire';
  switch (reason.kind) {
    case 'conditionFalse':
      return `condition false at ${reason.failedAt}`;
    case 'disabledByLayer':
      return `disabled by layer '${reason.layer}'`;
    case 'supersededByLayer':
      return `superseded by layer '${reason.layer}'`;
    case 'haltedEarlier':
      return `not reached: '${reason.byRuleKey}' halted the step`;
  }
}

function narrate(ruleKey: string, occurrences: Explanation['occurrences']): string {
  if (occurrences.length === 0) {
    // The honest answer. `inProfile` is inferred from absence, and absence has two causes:
    // a `fired-only` trace omits exactly the events this lookup depends on. Saying so here
    // is the only place it can be said — `Explanation` has no field for the trace level.
    return [
      `No \`rule\` event for '${ruleKey}' appears in this trace.`,
      'Either the rule is not in the resolved profile, or the trace was recorded at',
      "traceLevel 'fired-only', which omits rules that did not fire — only a 'full' trace",
      'answers "why not".',
    ].join(' ');
  }

  const fired = occurrences.filter((occurrence) => occurrence.status === 'fired').length;
  const lines = [
    `'${ruleKey}' fired ${fired} of ${occurrences.length} time${occurrences.length === 1 ? '' : 's'}.`,
  ];
  for (const occurrence of occurrences) {
    const detail =
      occurrence.status === 'fired'
        ? `fired, reading ${occurrence.factsRead.length} fact${occurrence.factsRead.length === 1 ? '' : 's'}`
        : `${occurrence.status} — ${describeSkip(occurrence.reason)}`;
    lines.push(`  ${occurrence.stepId} [${occurrence.phase}] ${detail}`);
  }
  return lines.join('\n');
}

export function explain(trace: { events: readonly TraceEvent[] }, ruleKey: string): Explanation {
  const events = eventsForRule(trace.events, ruleKey);

  const occurrences: Explanation['occurrences'] = events.map((event) => ({
    stepId: event.stepId,
    phase: event.phase,
    status: event.status,
    ...(event.reason === undefined ? {} : { reason: event.reason }),
    factsRead: event.factsRead,
  }));

  const citation = events[0]?.citation;

  return {
    ruleKey,
    inProfile: occurrences.length > 0,
    ...(citation === undefined ? {} : { citation }),
    occurrences,
    narrative: narrate(ruleKey, occurrences),
  };
}
