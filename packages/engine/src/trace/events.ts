/**
 * Reading a trace: the kind guards and the groupings the viewer and `explain()` share.
 *
 * There is no `phaseStart` event (ADR-0014), so grouping by `(stepId, phase)` is how a
 * viewer renders its eight fixed phase headers.
 */

import type { Phase, TraceEvent } from '../schema';

export type TraceEventOfKind<K extends TraceEvent['kind']> = Extract<TraceEvent, { kind: K }>;

export function isEventOfKind<K extends TraceEvent['kind']>(
  event: TraceEvent,
  kind: K,
): event is TraceEventOfKind<K> {
  return event.kind === kind;
}

export function eventsOfKind<K extends TraceEvent['kind']>(
  events: readonly TraceEvent[],
  kind: K,
): TraceEventOfKind<K>[] {
  return events.filter((event): event is TraceEventOfKind<K> => event.kind === kind);
}

/** Every `rule` event for one key, in `seq` order — the whole of what `explain()` reads. */
export function eventsForRule(
  events: readonly TraceEvent[],
  ruleKey: string,
): TraceEventOfKind<'rule'>[] {
  return eventsOfKind(events, 'rule').filter((event) => event.ruleKey === ruleKey);
}

export function stepPhaseKey(stepId: string, phase: Phase): string {
  return `${stepId}\u0000${phase}`;
}

export function groupByStepAndPhase(events: readonly TraceEvent[]): Map<string, TraceEvent[]> {
  const groups = new Map<string, TraceEvent[]>();
  for (const event of events) {
    const key = stepPhaseKey(event.stepId, event.phase);
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, [event]);
    } else {
      group.push(event);
    }
  }
  return groups;
}
