import { z } from 'zod';
import { Json } from './json';
import {
  ActorRef,
  DerivedTargetRef,
  DiceExpr,
  RollModeGrant,
  RollTargetRef,
  StackPolicy,
} from './primitives';
import { Duration } from './time';

/**
 * Transforms act on the dice *pool*, before the keep — both SRDs let a reroll replace one
 * die of an advantage pair, and the difference is observable (ADR-0011, superseding
 * ADR-0008's order).
 */
export const RollTransform = z.discriminatedUnion('kind', [
  /** Heroic Inspiration keeps `new`; a Lucky-style reroll keeps the `higher`. */
  z.strictObject({ kind: z.literal('reroll'), keep: z.enum(['new', 'higher']) }),
  z.strictObject({ kind: z.literal('minimumDie'), value: z.number().int().positive() }),
  z.strictObject({ kind: z.literal('replaceDie'), value: z.number().int().positive() }),
]);
export type RollTransform = z.infer<typeof RollTransform>;

/**
 * Which die of the pool a transform touches. `fixed` when the rule knows; `intent` when
 * the player chose, read from `situation.intents.rollChoices[rollId]` because ADR-0003
 * forbids pausing for input. An `intent` selector with no declared choice defaults to die
 * 0, which is a silent decision — `content:lint` warns about it (FR-17).
 */
export const DieSelector = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('fixed'), index: z.number().int().nonnegative() }),
  z.strictObject({ kind: z.literal('intent') }),
]);
export type DieSelector = z.infer<typeof DieSelector>;

/**
 * A value an effect reads from the fact registry when it is applied, instead of stating a
 * number a pack could only know for one fixture (ADR-0021, closing Q21). The path must be
 * registered, like any `var` in a condition, and resolves to a number (`actor.abilityMod.str`)
 * or to dice notation (`action.weapon.damage.dice` reads `1d8`).
 *
 * Deliberately just a path: an arithmetic form would let a flat bonus ride inside a value
 * where no stacking policy could reach it (FR-11).
 */
export const FactValueRef = z.strictObject({ fact: z.string().min(1) });
export type FactValueRef = z.infer<typeof FactValueRef>;

/** A flat number, dice rolled during the `modifiers` phase (Bless is `1d4`), or a fact. */
export const ModifierValue = z.union([z.number().int(), DiceExpr, FactValueRef]);
export type ModifierValue = z.infer<typeof ModifierValue>;

/** Dice as authored, or the path of a fact that reads as dice notation. */
export const DiceValue = z.union([DiceExpr, FactValueRef]);
export type DiceValue = z.infer<typeof DiceValue>;

/** A roll target or a non-roll derived value such as `actor.ac.effective` (ADR-0006). */
export const ModifierTargetRef = z.union([RollTargetRef, DerivedTargetRef]);
export type ModifierTargetRef = z.infer<typeof ModifierTargetRef>;

/*
 * There is deliberately no `Modifier` type here. One numeric contribution has three live
 * shapes and a fourth would only drift: the authored form is the `addModifier` effect
 * below, the engine-side form after its dice are rolled is `PendingModifier`
 * (`src/stacking/`), and the traced form after the policy ran is `AppliedModifier`
 * (`src/schema/trace.ts`). ADR-0019 closes Q20.
 */

/**
 * The effect catalogue (FR-7). Three of these act on a roll through separate channels with
 * separate algorithms — numeric `addModifier`, `rollMode` (advantage and disadvantage
 * cancel, however many of each), and `rollTransform` — which is what lets the same
 * `rule_key` grant advantage on SRD 5.1 and a reroll on 5.2.1 (ADR-0008, ADR-0011).
 */
export const Effect = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('setValue'),
    path: z.string().min(1),
    value: Json,
  }),
  z.strictObject({
    type: z.literal('addModifier'),
    target: ModifierTargetRef,
    value: ModifierValue,
    modifierType: z.string().min(1),
    stackKey: z.string().min(1).optional(),
    policy: StackPolicy,
  }),
  z.strictObject({
    type: z.literal('rollMode'),
    target: RollTargetRef,
    mode: RollModeGrant,
  }),
  z.strictObject({
    type: z.literal('rollTransform'),
    target: RollTargetRef,
    transform: RollTransform,
    uses: z.number().int().positive(),
    dieSelector: DieSelector,
  }),
  z.strictObject({
    type: z.literal('rollDice'),
    expr: DiceValue,
    into: z.string().min(1),
  }),
  z.strictObject({
    type: z.literal('applyCondition'),
    actor: ActorRef,
    condition: z.string().min(1),
    duration: Duration,
  }),
  z.strictObject({
    type: z.literal('removeCondition'),
    actor: ActorRef,
    condition: z.string().min(1),
  }),
  z.strictObject({
    type: z.literal('emitEvent'),
    event: z.string().min(1),
    data: Json.optional(),
  }),
  z.strictObject({
    type: z.literal('halt'),
    reason: z.string().min(1),
  }),
]);
export type Effect = z.infer<typeof Effect>;

export const EFFECT_TYPES = [
  'setValue',
  'addModifier',
  'rollMode',
  'rollTransform',
  'rollDice',
  'applyCondition',
  'removeCondition',
  'emitEvent',
  'halt',
] as const;

export type EffectType = (typeof EFFECT_TYPES)[number];
