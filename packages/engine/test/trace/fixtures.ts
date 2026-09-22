/**
 * Hand-built trace events. These are fixtures, not content — and building them by hand is
 * the point: the trace readers must be testable before anything emits a trace.
 */

import type { Citation, RuleProvenance, TraceEvent, TraceEventInput } from '../../src/schema';

export const citation: Citation = {
  source: 'srd-5.2.1',
  section: 'Rules Glossary > Prone [Condition]',
};

export const provenance: RuleProvenance = { layer: 'dnd5e-srd', version: '5.2.1', op: 'add' };

export function ruleEvent(
  overrides: Partial<Extract<TraceEvent, { kind: 'rule' }>> = {},
): TraceEventInput<Extract<TraceEvent, { kind: 'rule' }>> {
  const { seq: _seq, ...rest } = {
    seq: 0,
    stepId: 'r1-fighter',
    round: 1,
    phase: 'modifiers',
    kind: 'rule',
    ruleKey: 'condition.prone.attacked-within-5ft',
    status: 'fired',
    conditionResult: true,
    factsRead: [],
    deltas: [],
    citation,
    provenance,
    ...overrides,
  } as Extract<TraceEvent, { kind: 'rule' }>;
  return rest;
}

export function rollEvent(
  overrides: Partial<Extract<TraceEvent, { kind: 'roll' }>> = {},
): TraceEventInput<Extract<TraceEvent, { kind: 'roll' }>> {
  const { seq: _seq, ...rest } = {
    seq: 0,
    stepId: 'r1-fighter',
    round: 1,
    phase: 'roll',
    kind: 'roll',
    rollId: 'r1-fighter/attack:fighter',
    target: { kind: 'attack', actorId: 'fighter' },
    mode: 'advantage',
    modeInputs: [{ ruleKey: 'condition.prone.attacked-within-5ft', mode: 'advantage' }],
    dice: [4, 16],
    transforms: [],
    diceAfterTransforms: [4, 16],
    kept: 16,
    keptIndex: 1,
    forced: true,
    modifiers: [],
    dropped: [],
    total: 16,
    ...overrides,
  } as Extract<TraceEvent, { kind: 'roll' }>;
  return rest;
}
