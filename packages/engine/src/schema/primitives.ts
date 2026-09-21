import { z } from 'zod';

/**
 * The eight fixed resolution stages, run in this order once per step (FR-9, ADR-0012).
 * There is no `initiative` phase: an initiative roll is a roll *target* like any other
 * and is contributed to during `modifiers`.
 */
export const PHASES = [
  'upkeep',
  'declare',
  'modifiers',
  'roll',
  'compare',
  'damage',
  'apply',
  'expire',
] as const;

export const Phase = z.enum(PHASES);
export type Phase = z.infer<typeof Phase>;

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

export const Ability = z.enum(ABILITIES);
export type Ability = z.infer<typeof Ability>;

/** Required on every rule and fixture; sections are SRD section paths, never page numbers. */
export const Citation = z.strictObject({
  /** Pack id of the source, e.g. `srd-5.1` or `srd-5.2.1`. */
  source: z.string().min(1),
  /** Section path within it, e.g. `Rules Glossary > Prone [Condition]`. */
  section: z.string().min(1),
});
export type Citation = z.infer<typeof Citation>;

/**
 * Structured rather than a `1d4` string: the engine needs no expression parser, and the
 * trace renders the string form back out as `AppliedModifier.rolled.expr`.
 */
export const DiceExpr = z.strictObject({
  count: z.number().int().positive(),
  sides: z.number().int().positive(),
});
export type DiceExpr = z.infer<typeof DiceExpr>;

/** How same-type numeric modifiers combine (FR-11). Resolved in `src/stacking/`. */
export const StackPolicy = z.enum(['sum', 'highest', 'unique']);
export type StackPolicy = z.infer<typeof StackPolicy>;

/**
 * An actor as named by a rule. Rules are authored before any situation exists, so the
 * reference is symbolic — `$actor` is whoever is taking the step, `$target` the action's
 * target — or an explicit actor id. The resolver substitutes it per step.
 */
export const ActorRef = z.string().min(1);
export type ActorRef = z.infer<typeof ActorRef>;

export const SYMBOLIC_ACTOR_REFS = ['$actor', '$target'] as const;

export const RollTargetKind = z.enum(['attack', 'save', 'check', 'initiative', 'damage']);
export type RollTargetKind = z.infer<typeof RollTargetKind>;

/** A roll target once an actor is known: what the trace and the outcome carry (ADR-0014). */
export const RollTarget = z.strictObject({
  kind: RollTargetKind,
  actorId: z.string().min(1),
});
export type RollTarget = z.infer<typeof RollTarget>;

/** The authored form of the same thing, with a symbolic actor: `{ kind: attack, actor: $actor }`. */
export const RollTargetRef = z.strictObject({
  kind: RollTargetKind,
  actor: ActorRef,
});
export type RollTargetRef = z.infer<typeof RollTargetRef>;

/**
 * A non-roll derived value a modifier can target — effective AC, a save DC, damage
 * (ADR-0006). The path must be registered in the pack's fact registry.
 */
export const DerivedTargetRef = z.strictObject({
  path: z.string().min(1),
  actor: ActorRef,
});
export type DerivedTargetRef = z.infer<typeof DerivedTargetRef>;

/**
 * Identifies one die channel, `` `${stepId}/${kind}:${actorId}` `` plus a channel suffix for
 * dice that are not the d20 itself (`:reroll`, or the modifier type for a dice-valued
 * modifier). It is the join key across the trace, `forcedRolls` and `intents.rollChoices`
 * (ADR-0011, ADR-0014), and is derivable from the situation before evaluation so a template
 * can pre-declare a choice. `src/dice/` mints them.
 */
export const RollId = z.string().min(1);
export type RollId = z.infer<typeof RollId>;

export const RollMode = z.enum(['normal', 'advantage', 'disadvantage']);
export type RollMode = z.infer<typeof RollMode>;

/** What a `rollMode` effect can grant. `normal` is only ever a resolution result. */
export const RollModeGrant = z.enum(['advantage', 'disadvantage']);
export type RollModeGrant = z.infer<typeof RollModeGrant>;

/** `major.minor.patch`, optionally with a prerelease and build metadata (VR-1). */
export const Semver = z
  .string()
  .regex(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/,
    'must be a semver version, e.g. 5.2.1',
  );
export type Semver = z.infer<typeof Semver>;
