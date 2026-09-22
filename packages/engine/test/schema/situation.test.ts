import { describe, expect, it } from 'vitest';
import { Action, Intents, SITUATION_SCHEMA_VERSION, Situation, Step } from '../../src/index';
import { ATTACK_ROLL_ID, situation } from './fixtures';

describe('Situation', () => {
  it('accepts a timeline with an acting step and an idle one', () => {
    const parsed = Situation.parse(situation);

    expect(parsed.timeline).toHaveLength(2);
    expect(parsed.timeline[1]?.action).toBeNull();
  });

  it('keeps open-ended intents alongside the structured roll choices (ADR-0011)', () => {
    const parsed = Situation.parse(situation);

    expect(parsed.intents.useInspiration).toBe(true);
    expect(parsed.intents.rollChoices?.[ATTACK_ROLL_ID]).toEqual({ rerollDieIndex: 1 });
  });

  it('pins the schema version so saved scenarios can be migrated (VR-8)', () => {
    const stale = { ...situation, schemaVersion: SITUATION_SCHEMA_VERSION + 1 };

    expect(Situation.safeParse(stale).success).toBe(false);
  });

  it('rejects unknown keys rather than silently dropping them', () => {
    expect(Situation.safeParse({ ...situation, actor: 'fighter' }).success).toBe(false);
  });

  it('requires every ability score, since modifiers are derived from them (ADR-0006)', () => {
    const noCharisma = structuredClone(situation) as Record<string, unknown>;
    const actors = noCharisma.actors as { abilities: Record<string, number> }[];
    delete actors[0]?.abilities.cha;

    expect(Situation.safeParse(noCharisma).success).toBe(false);
  });

  it('rejects derived values that fixtures must not carry (FR-8)', () => {
    const withAttackBonus = structuredClone(situation) as Record<string, unknown>;
    const actors = withAttackBonus.actors as Record<string, unknown>[];
    if (actors[0]) actors[0].attackBonus = 5;

    expect(Situation.safeParse(withAttackBonus).success).toBe(false);
  });

  it('rejects an empty timeline: a single action is a timeline of length 1', () => {
    expect(Situation.safeParse({ ...situation, timeline: [] }).success).toBe(false);
  });

  it('rejects a step whose actor is not in the situation', () => {
    const ghost = structuredClone(situation);
    const step = ghost.timeline[0];
    if (step) step.actorId = 'nobody';

    const result = Situation.safeParse(ghost);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("unknown actor 'nobody'");
  });

  it('rejects an attack on a target that is not in the situation', () => {
    const ghost = structuredClone(situation);
    const action = ghost.timeline[0]?.action;
    if (action?.type === 'attack') action.targetId = 'nobody';

    const result = Situation.safeParse(ghost);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("unknown target actor 'nobody'");
  });

  it('rejects a weapon slug with nothing inlined behind it (ADR-0017)', () => {
    const dangling = structuredClone(situation);
    delete dangling.items.longsword;

    const result = Situation.safeParse(dangling);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("unknown item 'longsword'");
  });

  it('accepts an unarmed attack with no items at all', () => {
    const barehanded = structuredClone(situation);
    barehanded.items = {};
    for (const step of barehanded.timeline) {
      if (step.action?.type === 'attack') step.action.weapon = null;
    }

    expect(Situation.safeParse(barehanded).success).toBe(true);
  });

  it('rejects duplicate step ids, which trace events and roll ids address', () => {
    const clashing = structuredClone(situation);
    const step = clashing.timeline[1];
    if (step) step.id = 'r1-fighter';

    const result = Situation.safeParse(clashing);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("duplicate step id 'r1-fighter'");
  });

  it('rejects duplicate actor ids', () => {
    const clashing = structuredClone(situation);
    const actor = clashing.actors[1];
    if (actor) actor.id = 'fighter';

    expect(Situation.safeParse(clashing).success).toBe(false);
  });

  it('rejects a timeline whose rounds go backwards', () => {
    const backwards = structuredClone(situation);
    const first = backwards.timeline[0];
    if (first) first.round = 2;

    const result = Situation.safeParse(backwards);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('must not decrease');
  });
});

describe('Step and Action', () => {
  it('accepts a step with no action, because time still ticks (ADR-0005)', () => {
    const idle = Step.parse({ id: 'r2-goblin', round: 2, actorId: 'goblin', action: null });

    expect(idle.action).toBeNull();
  });

  it('accepts the action kinds the core subset needs', () => {
    expect(Action.parse({ type: 'useObject' }).type).toBe('useObject');
    expect(Action.parse({ type: 'save', ability: 'dex', dc: 13 }).type).toBe('save');
    expect(Action.parse({ type: 'check', ability: 'str', skill: 'athletics', dc: 15 }).type).toBe(
      'check',
    );
  });

  it('rejects an unknown action type rather than defaulting it', () => {
    expect(Action.safeParse({ type: 'dash' }).success).toBe(false);
  });

  it('rejects a round of 0: rounds are 1-based', () => {
    expect(
      Step.safeParse({ id: 'r0-goblin', round: 0, actorId: 'goblin', action: null }).success,
    ).toBe(false);
  });
});

describe('Intents', () => {
  it('accepts a situation with no declared choices at all', () => {
    expect(Intents.parse({})).toEqual({});
  });

  it('rejects a reroll die index that is not a whole, non-negative number', () => {
    const negative = { rollChoices: { [ATTACK_ROLL_ID]: { rerollDieIndex: -1 } } };

    expect(Intents.safeParse(negative).success).toBe(false);
  });
});
