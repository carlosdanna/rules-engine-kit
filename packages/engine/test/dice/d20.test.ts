import { describe, expect, it } from 'vitest';
import type { RollModeInput } from '../../src/dice';
import {
  applyTransform,
  createRoller,
  keepDie,
  makeRollId,
  resolveD20Roll,
  resolveRollMode,
} from '../../src/dice';

const ATTACK = makeRollId('r3-fighter', { kind: 'attack', actorId: 'fighter' });
const REROLL = `${ATTACK}:reroll`;

const advantage: RollModeInput = {
  ruleKey: 'condition.prone.attacked-within-5ft',
  mode: 'advantage',
};
const disadvantage: RollModeInput = {
  ruleKey: 'condition.prone.own-attacks',
  mode: 'disadvantage',
};

describe('resolveRollMode — advantage and disadvantage cancel as a set (step 1)', () => {
  it('is normal with no inputs', () => {
    expect(resolveRollMode([])).toBe('normal');
  });

  it('grants advantage or disadvantage on its own, however many sources', () => {
    expect(resolveRollMode([advantage])).toBe('advantage');
    expect(resolveRollMode([advantage, { ruleKey: 'house.flanking', mode: 'advantage' }])).toBe(
      'advantage',
    );
    expect(resolveRollMode([disadvantage])).toBe('disadvantage');
  });

  it('cancels to normal for 1 adv + 1 dis and for 1 adv + 2 dis', () => {
    // "This is true even if multiple circumstances impose Disadvantage and only one grants
    // Advantage or vice versa." — SRD 5.2.1, Playing the Game > D20 Tests.
    expect(resolveRollMode([advantage, disadvantage])).toBe('normal');
    expect(
      resolveRollMode([advantage, disadvantage, { ruleKey: 'cover.heavy', mode: 'disadvantage' }]),
    ).toBe('normal');
  });

  it('is order-independent', () => {
    expect(resolveRollMode([disadvantage, advantage])).toBe(
      resolveRollMode([advantage, disadvantage]),
    );
  });

  it('rolls one die when the modes cancel, not a discarded pair', () => {
    const roller = createRoller({ seed: 'demo-seed' });
    const roll = resolveD20Roll({ roller, rollId: ATTACK, modeInputs: [advantage, disadvantage] });
    expect(roll.mode).toBe('normal');
    expect(roll.dice).toHaveLength(1);
    expect(roller.log).toHaveLength(1);
  });
});

describe('keepDie (step 4)', () => {
  it('keeps the max under advantage and the min under disadvantage', () => {
    expect(keepDie([4, 16], 'advantage')).toEqual({ kept: 16, keptIndex: 1 });
    expect(keepDie([4, 16], 'disadvantage')).toEqual({ kept: 4, keptIndex: 0 });
  });

  it('keeps the only die when normal', () => {
    expect(keepDie([12], 'normal')).toEqual({ kept: 12, keptIndex: 0 });
  });

  it('breaks a tie towards the earlier die, so the kept index is a function of the pool', () => {
    expect(keepDie([16, 16], 'advantage')).toEqual({ kept: 16, keptIndex: 0 });
  });
});

describe('applyTransform (step 3) acts on the pool, not the kept die', () => {
  const roller = () => createRoller({ seed: 'demo-seed', forcedRolls: { [REROLL]: [11] } });

  it('rerolls one die of the pair and keeps `new` even when it is worse', () => {
    const { dice, applied } = applyTransform(
      [4, 16],
      { ruleKey: 'inspiration.spend', transform: { kind: 'reroll', keep: 'new' }, dieIndex: 0 },
      roller(),
      ATTACK,
    );
    expect(dice).toEqual([11, 16]);
    expect(applied).toEqual({
      ruleKey: 'inspiration.spend',
      kind: 'reroll',
      dieIndex: 0,
      from: 4,
      to: 11,
      clamped: false,
    });
  });

  it('keeps the `higher` of the two for a Lucky-style reroll', () => {
    const { dice } = applyTransform(
      [16, 4],
      { ruleKey: 'lucky', transform: { kind: 'reroll', keep: 'higher' }, dieIndex: 0 },
      roller(),
      ATTACK,
    );
    expect(dice).toEqual([16, 4]);
  });

  it('raises a die to a minimum, and replaces one outright', () => {
    expect(
      applyTransform(
        [4, 16],
        { ruleKey: 'reliable', transform: { kind: 'minimumDie', value: 10 }, dieIndex: 0 },
        roller(),
        ATTACK,
      ).dice,
    ).toEqual([10, 16]);

    expect(
      applyTransform(
        [4, 16],
        { ruleKey: 'portent', transform: { kind: 'replaceDie', value: 7 }, dieIndex: 1 },
        roller(),
        ATTACK,
      ).dice,
    ).toEqual([4, 7]);
  });

  it('leaves a die alone when minimumDie is below it', () => {
    expect(
      applyTransform(
        [16, 4],
        { ruleKey: 'reliable', transform: { kind: 'minimumDie', value: 10 }, dieIndex: 0 },
        roller(),
        ATTACK,
      ).dice,
    ).toEqual([16, 4]);
  });

  it('clamps an out-of-range die selector visibly, never silently', () => {
    // ADR-0011: an `intent` selector defaults to die 0 and can address a die that is not
    // there. The clamp is reported so the trace can show it.
    const { dice, applied } = applyTransform(
      [12],
      { ruleKey: 'inspiration.spend', transform: { kind: 'reroll', keep: 'new' }, dieIndex: 1 },
      roller(),
      ATTACK,
    );
    expect(applied.clamped).toBe(true);
    expect(applied.dieIndex).toBe(0);
    expect(dice).toEqual([11]);
  });

  it('does not mutate the pool it was given', () => {
    const pool = [4, 16];
    applyTransform(
      pool,
      { ruleKey: 'portent', transform: { kind: 'replaceDie', value: 7 }, dieIndex: 0 },
      roller(),
      ATTACK,
    );
    expect(pool).toEqual([4, 16]);
  });
});

describe('ADR-0011: transforms resolve before the keep', () => {
  it('reproduces the hand-derived table from the SRD', () => {
    // Melee attack on a prone target (advantage), attacker spends Heroic Inspiration.
    // Forced pair (4, 16); the reroll of the 4 comes up 11. Attack bonus +5, AC 20.
    //
    //   SRD / ours:      reroll die 0 -> (11, 16) -> keep 16 -> 16 + 5 = 21  -> hit
    //   ADR-0008 order:  keep 16 -> reroll it -> 11         -> 11 + 5 = 16  -> miss
    //
    // "you can reroll or replace only one die, not both. You choose which one."
    //   — SRD 5.2.1, Playing the Game > Interactions with Rerolls
    //   — SRD 5.1, Using Ability Scores > Advantage and Disadvantage
    const roller = createRoller({
      seed: 'demo-seed',
      forcedRolls: { [ATTACK]: [4, 16], [REROLL]: [11] },
    });

    const roll = resolveD20Roll({
      roller,
      rollId: ATTACK,
      modeInputs: [advantage],
      transforms: [
        { ruleKey: 'inspiration.spend', transform: { kind: 'reroll', keep: 'new' }, dieIndex: 0 },
      ],
    });

    expect(roll.mode).toBe('advantage');
    expect(roll.dice).toEqual([4, 16]);
    expect(roll.diceAfterTransforms).toEqual([11, 16]);
    expect(roll.kept).toBe(16);
    expect(roll.keptIndex).toBe(1);
    expect(roll.forced).toBe(true);

    const total = roll.kept + 5;
    expect(total).toBe(21);
    expect(total >= 20).toBe(true);

    // The superseded order would have rerolled the kept 16 into the 11 and missed.
    expect(roll.kept).not.toBe(11);
  });

  it('records dieIndex, from and to for each transform, as the trace event needs', () => {
    const roller = createRoller({
      seed: 'demo-seed',
      forcedRolls: { [ATTACK]: [4, 16], [REROLL]: [11] },
    });
    const roll = resolveD20Roll({
      roller,
      rollId: ATTACK,
      modeInputs: [advantage],
      transforms: [
        { ruleKey: 'inspiration.spend', transform: { kind: 'reroll', keep: 'new' }, dieIndex: 0 },
      ],
    });
    expect(roll.transforms).toEqual([
      {
        ruleKey: 'inspiration.spend',
        kind: 'reroll',
        dieIndex: 0,
        from: 4,
        to: 11,
        clamped: false,
      },
    ]);
  });

  it('applies several transforms in the order it is given them', () => {
    const roller = createRoller({ seed: 'demo-seed', forcedRolls: { [ATTACK]: [4, 16] } });
    const roll = resolveD20Roll({
      roller,
      rollId: ATTACK,
      modeInputs: [advantage],
      transforms: [
        { ruleKey: 'reliable', transform: { kind: 'minimumDie', value: 10 }, dieIndex: 0 },
        { ruleKey: 'portent', transform: { kind: 'replaceDie', value: 3 }, dieIndex: 1 },
      ],
    });
    expect(roll.diceAfterTransforms).toEqual([10, 3]);
    expect(roll.kept).toBe(10);
  });
});

describe('the same rule_key, two editions (docs/spike-notes.md §1)', () => {
  // `inspiration.spend` swaps channel between packs: advantage on SRD 5.1, a reroll that
  // must keep the new die on SRD 5.2.1. Forced dice (15, 4), attack bonus +5, AC 15.
  it('SRD 5.1 grants advantage: keeps the 15 and hits', () => {
    const roller = createRoller({ seed: 'demo-seed', forcedRolls: { [ATTACK]: [15, 4] } });
    const roll = resolveD20Roll({
      roller,
      rollId: ATTACK,
      modeInputs: [{ ruleKey: 'inspiration.spend', mode: 'advantage' }],
    });
    expect(roll.dice).toEqual([15, 4]);
    expect(roll.kept).toBe(15);
    expect(roll.kept + 5).toBe(20);
    expect(roll.kept + 5 >= 15).toBe(true);
  });

  it('SRD 5.2.1 rerolls instead: one die, keeps the new 4 and misses', () => {
    const roller = createRoller({
      seed: 'demo-seed',
      forcedRolls: { [ATTACK]: [15], [REROLL]: [4] },
    });
    const roll = resolveD20Roll({
      roller,
      rollId: ATTACK,
      modeInputs: [],
      transforms: [
        { ruleKey: 'inspiration.spend', transform: { kind: 'reroll', keep: 'new' }, dieIndex: 0 },
      ],
    });
    expect(roll.mode).toBe('normal');
    expect(roll.dice).toEqual([15]);
    expect(roll.diceAfterTransforms).toEqual([4]);
    expect(roll.kept).toBe(4);
    expect(roll.kept + 5).toBe(9);
    expect(roll.kept + 5 >= 15).toBe(false);
  });
});

describe('determinism of a whole roll', () => {
  it('same seed ⇒ deep-equal roll, with no forced dice at all', () => {
    const run = () =>
      resolveD20Roll({
        roller: createRoller({ seed: 'demo-seed' }),
        rollId: ATTACK,
        modeInputs: [advantage],
        transforms: [
          { ruleKey: 'inspiration.spend', transform: { kind: 'reroll', keep: 'new' }, dieIndex: 0 },
        ],
      });
    expect(run()).toEqual(run());
    expect(run().forced).toBe(false);
  });
});
