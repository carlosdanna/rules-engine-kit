import { z } from 'zod';
import { Ability, DiceExpr, RollId } from './primitives';

/**
 * Bumped whenever the shape changes; saved user scenarios are migrated to it (VR-8).
 * At 3 since ADR-0025 gave `Actor` its damage resistances and vulnerabilities. Like
 * ADR-0017's item inlining before it, and ADR-0011's `intents.rollChoices` before that,
 * it landed before anything was persisted.
 */
export const SITUATION_SCHEMA_VERSION = 3;

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
  /**
   * Damage types this creature takes half of, and double of, as the rules read them —
   * `piercing`, `fire` (ADR-0025). Printed values like everything else here: a rule reads
   * them to decide whether to grant the scale, and the engine applies it. Nothing writes
   * them, so a spell that granted resistance would need its own channel.
   */
  resistances: z.array(z.string().min(1)),
  vulnerabilities: z.array(z.string().min(1)),
});
export type Actor = z.infer<typeof Actor>;

/**
 * An item fixture, inlined (ADR-0017). Printed values only, like `Actor`: the citation
 * stays on the fixture row, which is seeded content, not on the copy inside a situation.
 *
 * `mastery` is the 5.2.1 weapon mastery property and is `null` on a 5.1-scoped fixture, so
 * one fixture can serve both editions and the difference is a rule reading the field or not.
 */
export const Item = z.strictObject({
  slug: z.string().min(1),
  name: z.string().min(1),
  /** `null` for anything that deals no damage of its own. */
  damage: z.strictObject({ dice: DiceExpr, type: z.string().min(1) }).nullable(),
  /** SRD weapon properties such as `finesse` or `heavy`, as the rules read them. */
  properties: z.array(z.string().min(1)),
  mastery: z.string().min(1).nullable(),
});
export type Item = z.infer<typeof Item>;

/** What an actor does on its turn. One action per step at most (ADR-0005). */
export const Action = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('attack'),
    mode: z.enum(['melee', 'ranged']),
    targetId: z.string().min(1),
    /**
     * Key into `situation.items`, or `null` for an unarmed/improvised attack. The slug is
     * kept rather than the item inlined here, so a weapon used on twelve steps is stored
     * once and `action.weapon` still reads as a slug for a rule that compares names.
     */
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
    /** Inlined item fixtures, keyed by slug (ADR-0017). Empty when nothing wields anything. */
    items: z.record(z.string(), Item),
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

      // What makes "self-contained" a guarantee rather than a convention (ADR-0017): a
      // rendered situation has no slug pointing at a row outside it.
      if (
        step.action !== null &&
        step.action.type === 'attack' &&
        step.action.weapon !== null &&
        situation.items[step.action.weapon] === undefined
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['timeline', index, 'action', 'weapon'],
          message: `unknown item '${step.action.weapon}': every weapon slug must be inlined in \`items\` (ADR-0017)`,
        });
      }
    }
  });
export type Situation = z.infer<typeof Situation>;

/**
 * The smallest thing that parses: what a blank-slate scenario starts from (FR-18).
 *
 * It lives here rather than in the app because every constraint it satisfies is a property
 * of the schema directly above it — five required keys with no defaults, `actors` and
 * `timeline` non-empty, a step whose `actorId` resolves — and a `SITUATION_SCHEMA_VERSION`
 * bump should break one file next to the literal it invalidates. Pure and constant, so
 * `test/purity.test.ts` stays green and the browser can call it (NFR-3).
 *
 * All six abilities are written out although `z.record(Ability, …)` would accept fewer: a
 * missing one passes the schema and throws as an unknown fact when a rule reads it.
 */
export function blankSituation(): Situation {
  return {
    schemaVersion: SITUATION_SCHEMA_VERSION,
    actors: [
      {
        id: 'actor',
        name: 'New actor',
        abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
        proficiencyBonus: 2,
        ac: 10,
        hp: 10,
        hpCurrent: 10,
        conditions: [],
        resistances: [],
        vulnerabilities: [],
      },
    ],
    items: {},
    /** One turn taking no action: time still ticks, and nothing has to be chosen yet. */
    timeline: [{ id: 'r1-actor', round: 1, actorId: 'actor', action: null }],
    intents: {},
  };
}
