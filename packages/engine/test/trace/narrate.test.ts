import { describe, expect, it } from 'vitest';
import type { TraceEvent } from '../../src/schema';
import {
  createTraceBuilder,
  type NarrativeContext,
  narrateEvent,
  narrateTrace,
} from '../../src/trace';
import { rollEvent, ruleEvent } from './fixtures';

const context: NarrativeContext = {
  steps: [
    { id: 'r11-cleric', round: 11, actorId: 'cleric' },
    { id: 'r11-fighter', round: 11, actorId: 'fighter' },
  ],
  actorNames: { cleric: 'Cleric', fighter: 'Fighter', goblin: 'Goblin' },
};

const withSeq = (event: object): TraceEvent => ({ seq: 0, ...event }) as TraceEvent;

describe('narrateEvent — rules and rolls (NFR-7)', () => {
  it('renders a fired rule with its citation and stays silent about the rest', () => {
    expect(narrateEvent(withSeq(ruleEvent()))).toBe(
      '  [modifiers] condition.prone.attacked-within-5ft fired (srd-5.2.1 · Rules Glossary > Prone [Condition])',
    );
    expect(
      narrateEvent(withSeq(ruleEvent({ status: 'skipped', conditionResult: false }))),
    ).toBeNull();
  });

  it('shows the pool, the transform that changed it and the kept die', () => {
    const event = withSeq(
      rollEvent({
        transforms: [
          {
            ruleKey: 'inspiration.spend',
            kind: 'reroll',
            dieIndex: 0,
            from: 4,
            to: 11,
            clamped: false,
          },
        ],
        diceAfterTransforms: [11, 16],
        modifiers: [
          { ruleKey: 'stat.ability', modifierType: 'ability', policy: 'sum', value: 3 },
          { ruleKey: 'stat.proficiency', modifierType: 'proficiency', policy: 'unique', value: 2 },
        ],
        total: 21,
      }),
    );
    expect(narrateEvent(event, context)).toBe(
      [
        '  [roll] attack:Fighter: advantage from condition.prone.attacked-within-5ft ⇒ advantage',
        '         dice [4,16] → reroll die[0] 4→11 (inspiration.spend) → [11,16]',
        '         kept 16 +3 ability +2 proficiency = 21',
      ].join('\n'),
    );
  });

  it('falls back to raw ids when no context is supplied', () => {
    expect(narrateEvent(withSeq(rollEvent()), undefined)).toContain('attack:fighter');
  });

  it('renders a comparison as the arithmetic it is', () => {
    const event = withSeq({
      stepId: 'r1-fighter',
      round: 1,
      phase: 'compare',
      kind: 'compare',
      rollId: 'r1-fighter/attack:fighter',
      target: { kind: 'attack', actorId: 'fighter' },
      total: 21,
      dc: 20,
      result: 'hit',
    });
    expect(narrateEvent(event, context)).toBe('  [compare] 21 vs DC 20 → hit');
  });

  it('names the dropped modifier and what beat it on a stacking event', () => {
    const event = withSeq({
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
    expect(narrateEvent(event, context)).toBe(
      '  [stacking] actor.ac.effective for Goblin: +2 cover (dropped +1 cover, beaten by cover.half)',
    );
  });
});

describe('narrateEvent — effect application and expiry (ADR-0012)', () => {
  const expiry = (stepId: string) =>
    withSeq({
      stepId,
      round: 11,
      phase: 'expire',
      kind: 'expiry',
      effectId: 'eff-1',
      sourceRuleKey: 'spell.bless.duration',
      at: { round: 11, stepIndex: 0, edge: 'end' },
    });

  it("names whose turn the effect's anchor point is, not just the round", () => {
    // The requirement ADR-0012 puts on this renderer: expiry is anchored to the source, so
    // the prose has to say whose turn ended it.
    expect(narrateEvent(expiry('r11-cleric'), context)).toBe(
      "  [expire] spell.bless.duration ended at the end of Cleric's turn, round 11",
    );
  });

  it("adds whose turn it was swept on when that differs from the anchor's", () => {
    // The surprising case: the fighter loses Bless during the cleric's turn, before its own.
    expect(narrateEvent(expiry('r11-fighter'), context)).toBe(
      "  [expire] spell.bless.duration ended at the end of Cleric's turn, round 11, swept during Fighter's turn",
    );
  });

  it('shows the scheduled end the moment an effect lands', () => {
    const event = withSeq({
      stepId: 'r1-cleric',
      round: 1,
      phase: 'apply',
      kind: 'effectApplied',
      effectId: 'eff-1',
      sourceRuleKey: 'spell.bless',
      onActorId: 'fighter',
      expiresAt: { kind: 'at', point: { round: 11, stepIndex: 20, edge: 'end' } },
    });
    expect(narrateEvent(event, context)).toBe(
      '  [apply] spell.bless on Fighter, until the end of round 11 (step 20)',
    );
  });

  it('distinguishes outliving the run from being permanent', () => {
    const base = {
      stepId: 'r1-cleric',
      round: 1,
      phase: 'apply',
      kind: 'effectApplied',
      effectId: 'eff-1',
      sourceRuleKey: 'spell.bless',
      onActorId: 'fighter',
    };
    expect(narrateEvent(withSeq({ ...base, expiresAt: { kind: 'permanent' } }), context)).toContain(
      'permanently',
    );
    expect(
      narrateEvent(
        withSeq({ ...base, expiresAt: { kind: 'beyondTimeline', wouldExpireInRound: 21 } }),
        context,
      ),
    ).toContain('until round 21, beyond this timeline');
  });
});

describe('narrateTrace — the whole run (NFR-7)', () => {
  it('heads each step with its round and actor', () => {
    const builder = createTraceBuilder();
    builder.push(ruleEvent({ stepId: 'r11-cleric', round: 11 }));
    builder.push(ruleEvent({ stepId: 'r11-fighter', round: 11, ruleKey: 'other' }));
    expect(narrateTrace(builder.build(), context).split('\n')).toEqual([
      'round 11, r11-cleric — Cleric',
      '  [modifiers] condition.prone.attacked-within-5ft fired (srd-5.2.1 · Rules Glossary > Prone [Condition])',
      'round 11, r11-fighter — Fighter',
      '  [modifiers] other fired (srd-5.2.1 · Rules Glossary > Prone [Condition])',
    ]);
  });
});
