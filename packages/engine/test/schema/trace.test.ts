import { describe, expect, it } from 'vitest';
import { ENGINE_VERSION, Outcome, TRACE_SCHEMA_VERSION, Trace, TraceEvent } from '../../src/index';
import { outcome, rollEvent, trace } from './fixtures';

describe('Trace', () => {
  it('is a flat, versioned array of ordered events (ADR-0010)', () => {
    const parsed = Trace.parse(trace);

    expect(parsed.traceSchemaVersion).toBe(TRACE_SCHEMA_VERSION);
    expect(parsed.events.map((event) => event.seq)).toEqual([0, 1, 2]);
  });

  it('refuses a trace stamped with a version this engine does not know', () => {
    expect(Trace.safeParse({ ...trace, traceSchemaVersion: 2 }).success).toBe(false);
  });

  it('accepts an empty event list, which is what `fired-only` can produce', () => {
    expect(Trace.safeParse({ traceSchemaVersion: TRACE_SCHEMA_VERSION, events: [] }).success).toBe(
      true,
    );
  });
});

describe('TraceEvent', () => {
  it('records a rule that fired with the facts it read, in read order (FR-14)', () => {
    const ruleEvent = trace.events[0];

    expect(ruleEvent?.kind).toBe('rule');
    if (ruleEvent?.kind !== 'rule') return;
    expect(ruleEvent.factsRead.map((read) => read.path)).toEqual([
      'step.action.type',
      'target.conditions',
      'action.rangeFt',
    ]);
  });

  it('records a skipped rule with the sub-condition that failed (ADR-0013)', () => {
    const skipped = TraceEvent.safeParse({
      seq: 3,
      stepId: 'r1-fighter',
      round: 1,
      phase: 'modifiers',
      kind: 'rule',
      ruleKey: 'condition.prone.attacked-beyond-5ft',
      status: 'skipped',
      reason: { kind: 'conditionFalse', failedAt: '/all/2' },
      conditionResult: false,
      factsRead: [{ path: 'action.rangeFt', value: 5 }],
      deltas: [],
      citation: { source: 'srd-5.2.1', section: 'Rules Glossary > Prone [Condition]' },
      provenance: { layer: 'dnd5e-srd', version: '5.2.1', op: 'add' },
    });

    expect(skipped.success).toBe(true);
  });

  it('keeps the dice pool before and after transforms, plus which die changed (ADR-0011)', () => {
    const parsed = TraceEvent.parse(rollEvent);

    expect(parsed.kind).toBe('roll');
    if (parsed.kind !== 'roll') return;
    expect(parsed.dice).toEqual([4, 16]);
    expect(parsed.transforms[0]?.dieIndex).toBe(0);
    expect(parsed.diceAfterTransforms).toEqual([11, 16]);
    expect(parsed.kept).toBe(16);
    expect(parsed.keptIndex).toBe(1);
  });

  it('records the dice behind a dice-valued modifier, not just its total', () => {
    const blessed = structuredClone(rollEvent);
    if (blessed.kind !== 'roll') return;
    blessed.modifiers.push({
      ruleKey: 'spell.bless.attack',
      modifierType: 'bless',
      stackKey: 'bless',
      policy: 'unique',
      value: 3,
      rolled: { expr: '1d4', dice: [3] },
    });

    const parsed = TraceEvent.parse(blessed);

    expect(parsed.kind === 'roll' && parsed.modifiers.at(-1)?.rolled?.dice).toEqual([3]);
  });

  it('narrates the comparison, and allows one with no roll behind it', () => {
    const passive = TraceEvent.safeParse({
      seq: 4,
      stepId: 'r1-fighter',
      round: 1,
      phase: 'compare',
      kind: 'compare',
      rollId: null,
      target: { kind: 'check', actorId: 'fighter' },
      total: 14,
      dc: 15,
      result: 'failure',
    });

    expect(passive.success).toBe(true);
  });

  it('records an effect being applied with its scheduled end (ADR-0014)', () => {
    const applied = TraceEvent.safeParse({
      seq: 5,
      stepId: 'r1-cleric',
      round: 1,
      phase: 'apply',
      kind: 'effectApplied',
      effectId: 'eff-1',
      sourceRuleKey: 'spell.bless.cast',
      onActorId: 'fighter',
      expiresAt: { kind: 'at', point: { round: 11, stepIndex: 20, edge: 'end' } },
    });

    expect(applied.success).toBe(true);
  });

  it('names the step an expiry happened on, which is the anchor actor’s, not the target’s', () => {
    const expiry = TraceEvent.safeParse({
      seq: 6,
      stepId: 'r11-cleric',
      round: 11,
      phase: 'expire',
      kind: 'expiry',
      effectId: 'eff-1',
      sourceRuleKey: 'spell.bless.cast',
      at: { round: 11, stepIndex: 20, edge: 'end' },
    });

    expect(expiry.success).toBe(true);
  });

  it('scopes `stacking` to non-roll targets; rolls carry their own modifiers', () => {
    const stacking = TraceEvent.safeParse({
      seq: 7,
      stepId: 'r1-fighter',
      round: 1,
      phase: 'modifiers',
      kind: 'stacking',
      target: 'actor.ac.effective',
      actorId: 'goblin',
      applied: [{ ruleKey: 'cover.half', modifierType: 'cover', policy: 'highest', value: 2 }],
      dropped: [
        {
          modifier: {
            ruleKey: 'cover.quarter',
            modifierType: 'cover',
            policy: 'highest',
            value: 1,
          },
          policy: 'highest',
          beatenBy: 'cover.half',
        },
      ],
    });

    expect(stacking.success).toBe(true);
  });

  it('has no phaseStart event: the phase list is fixed (ADR-0014)', () => {
    const phaseStart = {
      seq: 8,
      stepId: 'r1-fighter',
      round: 1,
      phase: 'roll',
      kind: 'phaseStart',
    };

    expect(TraceEvent.safeParse(phaseStart).success).toBe(false);
  });

  it('rejects an event that does not say where it happened', () => {
    const orphan = structuredClone(rollEvent) as Record<string, unknown>;
    delete orphan.stepId;

    expect(TraceEvent.safeParse(orphan).success).toBe(false);
  });
});

describe('Outcome', () => {
  it('carries per-step results, final state and the derived values with their terms', () => {
    const parsed = Outcome.parse(outcome);

    expect(parsed.steps[0]?.comparisons[0]?.result).toBe('hit');
    expect(parsed.finalState.actors.goblin?.hpCurrent).toBe(0);
    expect(parsed.derived[0]?.total).toBe(5);
  });

  it('stamps seed, profile hash and both versions, so a replay is honest (VR-7)', () => {
    const parsed = Outcome.parse(outcome);

    expect(parsed.seed).toBe('demo-seed');
    expect(parsed.engineVersion).toBe(ENGINE_VERSION);
    expect(parsed.traceSchemaVersion).toBe(TRACE_SCHEMA_VERSION);
  });

  it('rejects an outcome with no seed: determinism has to be reproducible (FR-13)', () => {
    expect(Outcome.safeParse({ ...outcome, seed: '' }).success).toBe(false);
  });

  it('reports effects still running at the end rather than dropping them (ADR-0012)', () => {
    const stillBlessed = Outcome.parse({
      ...outcome,
      finalState: {
        ...outcome.finalState,
        activeEffects: [
          {
            id: 'eff-1',
            sourceRuleKey: 'spell.bless.cast',
            actorId: 'fighter',
            condition: 'blessed',
            duration: { kind: 'rounds', rounds: 10, anchor: { kind: 'source' }, edge: 'end' },
            appliedAt: { round: 1, stepIndex: 0, edge: 'end' },
            expiresAt: { kind: 'beyondTimeline', wouldExpireInRound: 11 },
          },
        ],
      },
    });

    expect(stillBlessed.finalState.activeEffects[0]?.expiresAt.kind).toBe('beyondTimeline');
  });
});
