/**
 * SPIKE — throwaway rule packs. Paraphrased from SRD 5.1 and SRD 5.2.1 only.
 * Conditions are TS predicates instead of JSON Logic; `v()` records the fact read.
 */

import { actorOf, v } from './engine';
import type { Action, Effect, FactReader, Layer, Rule, RuleCtx } from './model';

const SRD51 = (section: string) => ({ source: 'srd-5.1', section });
const SRD521 = (section: string) => ({ source: 'srd-5.2.1', section });

const attackOf = (ctx: RuleCtx) =>
  ctx.step.action.type === 'attack'
    ? (ctx.step.action as Extract<Action, { type: 'attack' }>)
    : null;

const target = (ctx: RuleCtx) => `attack:${ctx.step.actorId}`;

const isAttacking = (f: FactReader, ctx: RuleCtx) =>
  v(f, 'step.action.type', ctx.step.action.type) === 'attack';

const abilityMod = (score: number) => Math.floor((score - 10) / 2);

// ------------------------------------------------------------------ shared rule bodies

function baseRules(
  cite: (s: string) => { source: string; section: string },
  sections: {
    abilityMod: string;
    proficiency: string;
    prone: string;
    poisoned: string;
    bless: string;
    blessDuration: string;
  },
): Rule[] {
  return [
    {
      key: 'attack.ability-modifier',
      phase: 'modifiers',
      priority: 10,
      label: 'Ability modifier on an attack roll',
      condition: isAttacking,
      effects: (f, ctx) => [
        {
          type: 'addModifier',
          target: target(ctx),
          value: abilityMod(
            v(
              f,
              `actor.${ctx.step.actorId}.abilities.str`,
              actorOf(ctx, ctx.step.actorId).abilities.str,
            ),
          ),
          modifierType: 'ability',
          policy: 'sum',
        },
      ],
      citation: cite(sections.abilityMod),
    },
    {
      key: 'attack.proficiency',
      phase: 'modifiers',
      priority: 20,
      label: 'Proficiency bonus on an attack roll',
      condition: isAttacking,
      effects: (f, ctx) => [
        {
          type: 'addModifier',
          target: target(ctx),
          value: v(
            f,
            `actor.${ctx.step.actorId}.proficiencyBonus`,
            actorOf(ctx, ctx.step.actorId).proficiencyBonus,
          ),
          modifierType: 'proficiency',
          stackKey: 'proficiency',
          policy: 'unique',
        },
      ],
      citation: cite(sections.proficiency),
      interpretation: 'The bonus cannot be added twice, so it is modelled as policy "unique".',
    },

    // ---- prone: two rules, because the SRD splits on the attacker's distance
    {
      key: 'condition.prone.attacked-within-5ft',
      phase: 'modifiers',
      priority: 30,
      label: 'Attack against a prone creature from within 5 feet has advantage',
      condition: (f, ctx) => {
        const a = attackOf(ctx);
        if (!isAttacking(f, ctx) || !a) return false;
        const prone = v(
          f,
          `actor.${a.targetId}.conditions`,
          actorOf(ctx, a.targetId).conditions,
        ).includes('prone');
        const near = v(f, 'action.rangeFt', a.rangeFt) <= 5;
        return prone && near;
      },
      effects: (_f, ctx) => [{ type: 'rollMode', target: target(ctx), mode: 'advantage' }],
      citation: cite(sections.prone),
    },
    {
      key: 'condition.prone.attacked-beyond-5ft',
      phase: 'modifiers',
      priority: 31,
      label: 'Attack against a prone creature from beyond 5 feet has disadvantage',
      condition: (f, ctx) => {
        const a = attackOf(ctx);
        if (!isAttacking(f, ctx) || !a) return false;
        const prone = v(
          f,
          `actor.${a.targetId}.conditions`,
          actorOf(ctx, a.targetId).conditions,
        ).includes('prone');
        const far = v(f, 'action.rangeFt', a.rangeFt) > 5;
        return prone && far;
      },
      effects: (_f, ctx) => [{ type: 'rollMode', target: target(ctx), mode: 'disadvantage' }],
      citation: cite(sections.prone),
    },
    {
      key: 'condition.prone.self-attacks',
      phase: 'modifiers',
      priority: 32,
      label: 'A prone creature has disadvantage on attack rolls',
      condition: (f, ctx) =>
        isAttacking(f, ctx) &&
        v(
          f,
          `actor.${ctx.step.actorId}.conditions`,
          actorOf(ctx, ctx.step.actorId).conditions,
        ).includes('prone'),
      effects: (_f, ctx) => [{ type: 'rollMode', target: target(ctx), mode: 'disadvantage' }],
      citation: cite(sections.prone),
    },
    {
      key: 'condition.poisoned.attacks',
      phase: 'modifiers',
      priority: 33,
      label: 'A poisoned creature has disadvantage on attack rolls',
      condition: (f, ctx) =>
        isAttacking(f, ctx) &&
        v(
          f,
          `actor.${ctx.step.actorId}.conditions`,
          actorOf(ctx, ctx.step.actorId).conditions,
        ).includes('poisoned'),
      effects: (_f, ctx) => [{ type: 'rollMode', target: target(ctx), mode: 'disadvantage' }],
      citation: cite(sections.poisoned),
    },

    // ---- bless
    {
      key: 'spell.bless.cast',
      phase: 'apply',
      priority: 10,
      label: 'Casting Bless',
      condition: (f, ctx) => v(f, 'step.action.type', ctx.step.action.type) === 'castBless',
      effects: (_f, ctx) => {
        const a = ctx.step.action as Extract<Action, { type: 'castBless' }>;
        return a.targetIds.map<Effect>((id) => ({
          type: 'applyCondition',
          actorId: id,
          condition: 'blessed',
          // 1 minute = 10 rounds (ADR-0007). Anchor + edge are a SPIKE addition.
          duration: {
            kind: 'rounds',
            rounds: 10,
            anchorActorId: ctx.step.actorId,
            edge: 'end',
          },
        }));
      },
      citation: cite(sections.bless),
      interpretation:
        'Duration "1 minute" is encoded as 10 rounds, ending at the end of the caster\'s turn ' +
        '10 rounds after casting. Neither SRD states the exact edge; concentration is not modelled.',
    },
    {
      key: 'spell.bless.attack-bonus',
      phase: 'modifiers',
      priority: 40,
      label: 'Bless adds 1d4 to an attack roll',
      condition: (f, ctx) =>
        isAttacking(f, ctx) &&
        v(
          f,
          `actor.${ctx.step.actorId}.conditions`,
          actorOf(ctx, ctx.step.actorId).conditions,
        ).includes('blessed'),
      effects: (_f, ctx) => [
        {
          type: 'addModifier',
          target: target(ctx),
          value: { count: 1, sides: 4 },
          modifierType: 'bless',
          stackKey: 'bless',
          policy: 'unique',
        },
      ],
      citation: cite(sections.blessDuration),
    },
  ];
}

// ------------------------------------------------------------------ SRD 5.1

export const srd51: Layer = {
  id: 'srd-5.1',
  version: '5.1.0',
  rules: [
    ...baseRules(SRD51, {
      abilityMod: 'Using Ability Scores > Ability Scores and Modifiers',
      proficiency: 'Using Ability Scores > Proficiency Bonus',
      prone: 'Appendix PH-A: Conditions > Prone',
      poisoned: 'Appendix PH-A: Conditions > Poisoned',
      bless: 'Spell Descriptions > Bless',
      blessDuration: 'Spell Descriptions > Bless',
    }),
    {
      key: 'inspiration.spend',
      phase: 'modifiers',
      priority: 50,
      label: 'Spend inspiration for advantage',
      condition: (f, ctx) =>
        isAttacking(f, ctx) &&
        v(f, 'intents.useInspiration', ctx.intents.useInspiration) === true &&
        v(
          f,
          `actor.${ctx.step.actorId}.conditions`,
          actorOf(ctx, ctx.step.actorId).conditions,
        ).includes('inspired'),
      effects: (_f, ctx) => [{ type: 'rollMode', target: target(ctx), mode: 'advantage' }],
      citation: SRD51('Inspiration > Using Inspiration'),
    },
  ],
};

// ------------------------------------------------------------------ SRD 5.2.1

export const srd521: Layer = {
  id: 'srd-5.2.1',
  version: '5.2.1',
  rules: [
    ...baseRules(SRD521, {
      abilityMod: 'Playing the Game > Ability Scores and Modifiers',
      proficiency: 'Playing the Game > Proficiency',
      prone: 'Rules Glossary > Prone [Condition]',
      poisoned: 'Rules Glossary > Poisoned [Condition]',
      bless: 'Spell Descriptions > Bless',
      blessDuration: 'Spell Descriptions > Bless',
    }),
    {
      // Same rule_key as 5.1; different channel entirely.
      key: 'inspiration.spend',
      phase: 'modifiers',
      priority: 50,
      label: 'Expend Heroic Inspiration to reroll the die',
      condition: (f, ctx) =>
        isAttacking(f, ctx) &&
        v(f, 'intents.useInspiration', ctx.intents.useInspiration) === true &&
        v(
          f,
          `actor.${ctx.step.actorId}.conditions`,
          actorOf(ctx, ctx.step.actorId).conditions,
        ).includes('inspired'),
      effects: (_f, ctx) => [
        {
          type: 'rollTransform',
          target: target(ctx),
          transform: { kind: 'reroll', keep: 'new' },
          uses: 1,
        },
      ],
      citation: SRD521('Rules Glossary > Heroic Inspiration'),
      interpretation:
        '"You must use the new roll" => keep: "new", not "higher". With Advantage or ' +
        'Disadvantage only one of the two dice may be rerolled (Playing the Game > ' +
        'Interactions with Rerolls); which one comes from situation.intents.rerollDieIndex.',
    },
  ],
};

// ------------------------------------------------------------------ house rule layer

export const houseFlanking: Layer = {
  id: 'house-flanking',
  version: '1.0.0',
  rules: [
    {
      key: 'house.flanking',
      phase: 'modifiers',
      priority: 60,
      label: 'Flanking grants advantage on a melee attack',
      condition: (f, ctx) => {
        const a = attackOf(ctx);
        return (
          isAttacking(f, ctx) &&
          a?.mode === 'melee' &&
          v(f, 'intents.flanking', ctx.intents.flanking) === true
        );
      },
      effects: (_f, ctx) => [{ type: 'rollMode', target: target(ctx), mode: 'advantage' }],
      citation: { source: 'house-rule', section: 'Flanking' },
      interpretation: 'Not SRD content; a house-rule layer used to prove layer precedence.',
    },
  ],
};
