import { z } from 'zod';
import { Ability, RollId } from './primitives';

/**
 * Bumped whenever the shape changes; saved user scenarios are migrated to it (VR-8).
 * Starts at 1 — ADR-0011 added `intents.rollChoices` before anything was persisted.
 */
export const SITUATION_SCHEMA_VERSION = 1;

/**
 * Printed inputs only (ADR-0006, FR-8). Deliberately absent: attack bonus, save DC,
 * initiative bonus and effective AC — all of those are derived by rules during the
 * `modifiers` phase and reported with their contributing terms.
 */
export const Actor = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Raw scores as printed. Ability modifiers come from the fact registry as arithmetic. */
  abilities: z.record(Ability, z.number().int()),
  proficiencyBonus: z.number().int().nonnegative(),
  /** Printed/base AC. Cover, spells and layers modify `actor.ac.effective`, not this. */
  ac: z.number().int(),
  hp: z.number().int().nonnegative(),
  hpCurrent: z.number().int().nonnegative(),
  /** Condition names such as `prone` or `blessed`, as the rules read them. */
  conditions: z.array(z.string().min(1)),
});
export type Actor = z.infer<typeof Actor>;

/** What an actor does on its turn. One action per step at most (ADR-0005). */
export const Action = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('attack'),
    mode: z.enum(['melee', 'ranged']),
    targetId: z.string().min(1),
    /** Fixture slug of the weapon used, or `null` for an unarmed/improvised attack. */
    weapon: z.string().min(1).nullable(),
    /** Distance to the target; prone reads it to decide advantage vs disadvantage. */
    rangeFt: z.number().int().nonnegative(),
  }),
  z.strictObject({
    type: z.literal('cast'),
    spell: z.string().min(1),
    targetIds: z.array(z.string().min(1)).min(1),
  }),
  z.strictObject({
    type: z.literal('check'),
    ability: Ability,
    skill: z.string().min(1).nullable(),
    dc: z.number().int(),
  }),
  z.strictObject({
    type: z.literal('save'),
    ability: Ability,
    dc: z.number().int(),
  }),
  /** "Use an Object" on SRD 5.1, "Utilize" on 5.2.1 — same rule key, different label. */
  z.strictObject({ type: z.literal('useObject') }),
]);
export type Action = z.infer<typeof Action>;

/** One turn. The phase loop runs once per step, and time ticks between steps. */
export const Step = z.strictObject({
  /** Stable; trace events, roll ids and forced rolls all address it. */
  id: z.string().min(1),
  round: z.number().int().positive(),
  actorId: z.string().min(1),
  /** `null` = takes no action, but time still ticks. */
  action: Action.nullable(),
});
export type Step = z.infer<typeof Step>;

/** A player choice attached to one roll, keyed by the roll id (ADR-0011). */
export const RollChoice = z.strictObject({
  rerollDieIndex: z.number().int().nonnegative().optional(),
});
export type RollChoice = z.infer<typeof RollChoice>;

/**
 * Every player choice, declared before evaluation starts — the engine never pauses
 * (ADR-0003). Named intents such as `useInspiration` are open-ended; `rollChoices` is the
 * one structured member, because ADR-0011 needs which die a transform touches.
 */
export const Intents = z.looseObject({
  rollChoices: z.record(RollId, RollChoice).optional(),
});
export type Intents = z.infer<typeof Intents>;

/**
 * The immutable input to `evaluate` (FR-1, FR-3). Time is the `timeline`: an ordered list
 * of turns declared up front, so durations can be observed expiring inside a single pure
 * call (ADR-0005). A plain single-action situation is a timeline of length 1.
 */
export const Situation = z
  .strictObject({
    schemaVersion: z.literal(SITUATION_SCHEMA_VERSION),
    actors: z.array(Actor).min(1),
    timeline: z.array(Step).min(1),
    intents: Intents,
  })
  .superRefine((situation, ctx) => {
    const actorIds = new Set<string>();
    for (const [index, actor] of situation.actors.entries()) {
      if (actorIds.has(actor.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['actors', index, 'id'],
          message: `duplicate actor id '${actor.id}'`,
        });
      }
      actorIds.add(actor.id);
    }

    const stepIds = new Set<string>();
    let previousRound = 0;

    for (const [index, step] of situation.timeline.entries()) {
      if (stepIds.has(step.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['timeline', index, 'id'],
          message: `duplicate step id '${step.id}'`,
        });
      }
      stepIds.add(step.id);

      if (step.round < previousRound) {
        ctx.addIssue({
          code: 'custom',
          path: ['timeline', index, 'round'],
          message: 'timeline rounds must not decrease',
        });
      }
      previousRound = step.round;

      if (!actorIds.has(step.actorId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['timeline', index, 'actorId'],
          message: `unknown actor '${step.actorId}'`,
        });
      }

      const targets =
        step.action === null
          ? []
          : step.action.type === 'attack'
            ? [step.action.targetId]
            : step.action.type === 'cast'
              ? step.action.targetIds
              : [];

      for (const targetId of targets) {
        if (!actorIds.has(targetId)) {
          ctx.addIssue({
            code: 'custom',
            path: ['timeline', index, 'action'],
            message: `unknown target actor '${targetId}'`,
          });
        }
      }
    }
  });
export type Situation = z.infer<typeof Situation>;
