import { z } from 'zod';
import { Ability, Citation, DiceExpr } from './primitives';

/**
 * Seeded example content a template draws on: a stat block or a piece of equipment
 * (`docs/content-authoring.md` § Fixture).
 *
 * The shapes below are `Actor` and `Item` from `./situation.ts` minus what rendering
 * supplies rather than an author: an actor's `id`, its starting `hpCurrent` and its
 * `conditions` come from the template, and an item's `slug` is the fixture's own. Keeping
 * them the same shape otherwise is what makes `renderTemplate` an inlining step rather
 * than a conversion (ADR-0017) — a fixture that parses here drops straight into a
 * situation.
 *
 * Printed values only (FR-8). Effective AC, attack bonuses and save DCs are derived by
 * rules during `modifiers` and reported with their terms, so a fixture that carried them
 * would be stating a result the engine is supposed to explain.
 */
export const FixtureKind = z.enum(['actor', 'item']);
export type FixtureKind = z.infer<typeof FixtureKind>;

export const ActorFixtureData = z.strictObject({
  name: z.string().min(1),
  /** Raw scores as printed. Ability modifiers come from the fact registry as arithmetic. */
  abilities: z.record(Ability, z.number().int()),
  proficiencyBonus: z.number().int().nonnegative(),
  /** Printed/base AC. Cover, spells and layers modify `actor.ac.effective`, not this. */
  ac: z.number().int(),
  hp: z.number().int().nonnegative(),
});
export type ActorFixtureData = z.infer<typeof ActorFixtureData>;

export const ItemFixtureData = z.strictObject({
  name: z.string().min(1),
  /** `null` for anything that deals no damage of its own. Authored as `1d8` notation. */
  damage: z.strictObject({ dice: DiceExpr, type: z.string().min(1) }).nullable(),
  /** SRD weapon properties such as `finesse` or `heavy`, as the rules read them. */
  properties: z.array(z.string().min(1)),
  /** The SRD 5.2.1 weapon mastery property; `null` on a weapon scoped to 5.1. */
  mastery: z.string().min(1).nullable(),
});
export type ItemFixtureData = z.infer<typeof ItemFixtureData>;

const FixtureIdentity = {
  slug: z.string().min(1),
  /**
   * The ruleset ids this fixture is valid under. At least one, because a fixture no
   * profile can see is content nothing will ever render. Where a stat block genuinely
   * differs between editions, write two fixtures and scope each one.
   */
  rulesetScope: z.array(z.string().min(1)).min(1),
  citation: Citation,
};

/**
 * `architecture.md`'s `fixtures` table lists a third kind, `effect`, which
 * `content-authoring.md` never specifies — see Q23 in `docs/open-questions.md`. Until it
 * says what such a fixture holds, the enum is the two kinds a situation can actually
 * carry.
 */
export const Fixture = z.discriminatedUnion('kind', [
  z.strictObject({ ...FixtureIdentity, kind: z.literal('actor'), data: ActorFixtureData }),
  z.strictObject({ ...FixtureIdentity, kind: z.literal('item'), data: ItemFixtureData }),
]);
export type Fixture = z.infer<typeof Fixture>;
