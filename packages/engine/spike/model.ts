/**
 * SPIKE — throwaway. Minimal restatement of the shapes in ADR-0005..0010, only
 * as far as the three hard rules need. Not the real schema; no Zod, no JSON Logic.
 */

export type Phase =
  | 'upkeep'
  | 'declare'
  | 'modifiers'
  | 'roll'
  | 'compare'
  | 'damage'
  | 'apply'
  | 'expire';

export const PHASES: Phase[] = [
  'upkeep',
  'declare',
  'modifiers',
  'roll',
  'compare',
  'damage',
  'apply',
  'expire',
];

// ---------------------------------------------------------------- time (ADR-0007)

export type Edge = 'start' | 'end';
export type TimePoint = { round: number; stepIndex: number; edge: Edge };

/**
 * SPIKE FINDING: ADR-0007's `{ kind: 'rounds', rounds }` cannot be resolved to a
 * TimePoint on its own — "10 rounds" is 10 rounds of *whose* turns, ending on
 * which edge? Bless needs the caster's turn, end edge. Anchor fields added here.
 */
export type Duration =
  | { kind: 'instant' }
  | { kind: 'untilTurn'; actorId: string; edge: Edge; afterRounds: number }
  | { kind: 'rounds'; rounds: number; anchorActorId: string; edge: Edge }
  | { kind: 'permanent' };

export type ActiveEffect = {
  id: string;
  sourceRuleKey: string;
  actorId: string; // who the effect is on
  duration: Duration;
  appliedAt: TimePoint;
  expiresAt: TimePoint | null;
  payload: Effect[]; // what the effect contributes while it is active
};

export function comparePoints(a: TimePoint, b: TimePoint): number {
  if (a.round !== b.round) return a.round - b.round;
  if (a.stepIndex !== b.stepIndex) return a.stepIndex - b.stepIndex;
  if (a.edge === b.edge) return 0;
  return a.edge === 'start' ? -1 : 1;
}

// ---------------------------------------------------------------- effects (ADR-0008)

export type RollTarget = string; // spike: `${kind}:${actorId}` e.g. 'attack:fighter'

export type StackPolicy = 'sum' | 'highest' | 'unique';

export type DiceExpr = { count: number; sides: number };

export type RollTransform =
  | { kind: 'reroll'; keep: 'new' | 'higher' }
  | { kind: 'minimumDie'; value: number };

export type Effect =
  | {
      type: 'addModifier';
      target: RollTarget;
      value: number | DiceExpr;
      modifierType: string;
      stackKey?: string;
      policy: StackPolicy;
    }
  | { type: 'rollMode'; target: RollTarget; mode: 'advantage' | 'disadvantage' }
  | { type: 'rollTransform'; target: RollTarget; transform: RollTransform; uses: number }
  | { type: 'applyCondition'; actorId: string; condition: string; duration: Duration }
  | { type: 'applyEffect'; actorId: string; duration: Duration; payload: Effect[] }
  | { type: 'emitEvent'; event: string; data?: unknown };

// ---------------------------------------------------------------- rules

export type Citation = { source: string; section: string };

export type Rule = {
  key: string;
  phase: Phase;
  priority: number;
  label: string;
  /** Spike stand-in for JSON Logic. `f` records every fact path it reads. */
  condition: (f: FactReader, ctx: RuleCtx) => boolean;
  effects: (f: FactReader, ctx: RuleCtx) => Effect[];
  citation: Citation;
  interpretation?: string;
};

export type ResolvedRule = Rule & {
  enabled: boolean;
  provenance: { layer: string; version: string; op: 'add' | 'override' | 'patch' | 'disable' }[];
};

export type Layer = { id: string; version: string; rules: Rule[]; disables?: string[] };

// ---------------------------------------------------------------- situation

export type Actor = {
  id: string;
  abilities: { str: number; dex: number };
  proficiencyBonus: number;
  ac: number;
  conditions: string[];
};

export type Action =
  | { type: 'attack'; mode: 'melee' | 'ranged'; targetId: string; rangeFt: number }
  | { type: 'castBless'; targetIds: string[] }
  | { type: 'none' };

export type Step = { id: string; round: number; actorId: string; action: Action };

export type Situation = {
  actors: Actor[];
  timeline: Step[];
  intents: Record<string, unknown>;
};

// ---------------------------------------------------------------- facts

export type FactRead = { path: string; value: unknown };

export type FactReader = {
  (path: string): unknown;
  reads: FactRead[];
};

export type RuleCtx = {
  step: Step;
  stepIndex: number;
  now: TimePoint;
  actors: Record<string, Actor>;
  intents: Record<string, unknown>;
  active: ActiveEffect[];
};

// ---------------------------------------------------------------- trace (ADR-0010)

export type AppliedModifier = {
  ruleKey: string;
  modifierType: string;
  stackKey?: string;
  policy: StackPolicy;
  value: number;
  /** SPIKE FINDING: a dice-valued modifier needs its roll recorded, not just its total. */
  rolled?: { expr: string; dice: number[] };
};

export type TraceEventBase = { seq: number; stepId: string; round: number; phase: Phase };

export type TraceEvent =
  | (TraceEventBase & { kind: 'phaseStart' })
  | (TraceEventBase & {
      kind: 'rule';
      ruleKey: string;
      status: 'fired' | 'skipped' | 'disabled';
      reason?: string;
      conditionResult: boolean | null;
      factsRead: FactRead[];
      citation: Citation;
      provenance: { layer: string; version: string };
    })
  | (TraceEventBase & {
      kind: 'roll';
      target: RollTarget;
      mode: 'normal' | 'advantage' | 'disadvantage';
      modeInputs: { ruleKey: string; mode: 'advantage' | 'disadvantage' }[];
      /** the pool as first rolled */
      dice: number[];
      /** the pool after transforms, before keep */
      diceAfterTransforms: number[];
      kept: number;
      keptIndex: number;
      forced: boolean;
      transforms: { ruleKey: string; kind: string; dieIndex: number; from: number; to: number }[];
      modifiers: AppliedModifier[];
      dropped: { modifier: AppliedModifier; policy: StackPolicy; beatenBy?: string }[];
      total: number;
    })
  | (TraceEventBase & {
      kind: 'compare';
      target: RollTarget;
      total: number;
      dc: number;
      result: 'hit' | 'miss';
    })
  | (TraceEventBase & {
      kind: 'effectApplied';
      effectId: string;
      sourceRuleKey: string;
      onActorId: string;
      expiresAt: TimePoint | null;
    })
  | (TraceEventBase & {
      kind: 'expiry';
      effectId: string;
      sourceRuleKey: string;
      expiresAt: TimePoint;
    });

export type Trace = { traceSchemaVersion: number; events: TraceEvent[] };

export type StepOutcome = {
  stepId: string;
  round: number;
  actorId: string;
  attack?: {
    mode: 'normal' | 'advantage' | 'disadvantage';
    dice: number[];
    kept: number;
    total: number;
    dc: number;
    result: 'hit' | 'miss';
  };
};

export type Outcome = {
  steps: StepOutcome[];
  activeAtEnd: { id: string; sourceRuleKey: string; actorId: string }[];
  seed: string;
};
