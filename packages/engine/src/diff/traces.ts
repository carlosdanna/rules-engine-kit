/**
 * `diffTraces` (FR-16): two traces aligned on step, phase and `rule_key`.
 *
 * `seq` is never compared — it is a position, and a rule one profile adds shifts every event
 * after it. A `rule` event's key is `stepId|phase|ruleKey`; every other kind is keyed on what
 * identifies it within its phase (a roll id, an actor, an effect id), so a roll is compared
 * with the same roll and not with whatever happened to be next.
 *
 * `firedOnlyIn` is the summary `/compare` leads with: a rule that fired on one side and did
 * not fire — was skipped, disabled, or absent — on the other.
 */

import { PHASES, type Phase, type Trace, type TraceEvent } from '../schema';
import { keyed, same } from './align';

export type RuleRef = { key: string; stepId: string; phase: Phase; ruleKey: string };

export type EventAlignment = {
  key: string;
  kind: TraceEvent['kind'];
  stepId: string;
  phase: Phase;
  /** Set for `rule` events only. */
  ruleKey: string | null;
  a: TraceEvent | null;
  b: TraceEvent | null;
  status: 'same' | 'changed' | 'onlyA' | 'onlyB';
  /** Fields that differ, sorted, `seq` excluded. Empty unless `status` is `changed`. */
  fields: string[];
};

export type TraceDiff = {
  identical: boolean;
  /** Every event of both traces, aligned, in step then phase order. */
  events: EventAlignment[];
  firedOnlyIn: { a: RuleRef[]; b: RuleRef[] };
};

const PHASE_INDEX = new Map<string, number>(PHASES.map((phase, index) => [phase, index]));

function discriminator(event: TraceEvent): string {
  switch (event.kind) {
    case 'rule':
      return event.ruleKey;
    case 'roll':
      return event.rollId;
    case 'compare':
      return event.rollId ?? `${event.target.kind}:${event.target.actorId}`;
    case 'stacking':
    case 'damageScale':
      return `${event.actorId}/${event.target}`;
    case 'damageApplied':
      return event.actorId;
    case 'effectApplied':
    case 'expiry':
      return event.effectId;
    case 'event':
      return event.event;
  }
}

export function alignmentKey(event: TraceEvent): string {
  const head = `${event.stepId}|${event.phase}`;
  return event.kind === 'rule'
    ? `${head}|${event.ruleKey}`
    : `${head}|${event.kind}|${discriminator(event)}`;
}

function differingFields(a: TraceEvent, b: TraceEvent): string[] {
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  return [...new Set([...Object.keys(x), ...Object.keys(y)])]
    .filter((field) => field !== 'seq' && !same(x[field], y[field]))
    .sort();
}

/**
 * Step order across both traces: A's steps, with each step only B has inserted before the
 * next step both share — so an Initiative step one edition adds lands before round 1's attack
 * rather than after the whole run.
 */
function stepOrder(a: Trace, b: Trace): Map<string, number> {
  const unique = (trace: Trace) => [...new Set(trace.events.map((event) => event.stepId))];
  const order = unique(a);
  const fromB = unique(b);
  fromB.forEach((stepId, index) => {
    if (order.includes(stepId)) return;
    const next = fromB.slice(index + 1).find((later) => order.includes(later));
    if (next === undefined) order.push(stepId);
    else order.splice(order.indexOf(next), 0, stepId);
  });
  return new Map(order.map((stepId, index) => [stepId, index]));
}

const fired = (event: TraceEvent | null): boolean =>
  event?.kind === 'rule' && event.status === 'fired';

export function diffTraces(a: Trace, b: Trace): TraceDiff {
  const left = keyed(a.events, alignmentKey);
  const right = keyed(b.events, alignmentKey);
  const steps = stepOrder(a, b);

  const rows: (EventAlignment & { position: number })[] = [];
  for (const key of new Set([...left.keys(), ...right.keys()])) {
    const x = left.get(key) ?? null;
    const y = right.get(key) ?? null;
    const event = (x ?? y) as TraceEvent;
    const fields = x !== null && y !== null ? differingFields(x, y) : [];
    rows.push({
      key,
      kind: event.kind,
      stepId: event.stepId,
      phase: event.phase,
      ruleKey: event.kind === 'rule' ? event.ruleKey : null,
      a: x,
      b: y,
      status: x === null ? 'onlyB' : y === null ? 'onlyA' : fields.length > 0 ? 'changed' : 'same',
      fields,
      position: event.seq,
    });
  }

  rows.sort(
    (p, q) =>
      (steps.get(p.stepId) ?? 0) - (steps.get(q.stepId) ?? 0) ||
      (PHASE_INDEX.get(p.phase) ?? 0) - (PHASE_INDEX.get(q.phase) ?? 0) ||
      p.position - q.position,
  );
  const events = rows.map(({ position: _position, ...row }) => row);

  const ref = (row: EventAlignment): RuleRef => ({
    key: row.key,
    stepId: row.stepId,
    phase: row.phase,
    ruleKey: row.ruleKey ?? '',
  });
  const rules = events.filter((row) => row.kind === 'rule');

  return {
    identical: events.every((row) => row.status === 'same'),
    events,
    firedOnlyIn: {
      a: rules.filter((row) => fired(row.a) && !fired(row.b)).map(ref),
      b: rules.filter((row) => fired(row.b) && !fired(row.a)).map(ref),
    },
  };
}
