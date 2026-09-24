import type { Actor, Fixture, Item } from '../schema';

/**
 * One fixture, inlined into a situation (ADR-0017).
 *
 * `renderTemplate` does this for every actor and weapon a skeleton names; the scenario editor
 * does it when someone adds a stat block or a weapon by hand. One function each, so a fixture
 * copied into a literal scenario is exactly what a template would have produced from it.
 *
 * A fixture's data is `Actor` or `Item` minus what the caller supplies (`fixture.ts`), which is
 * why this is a spread and not a conversion.
 */

export type ActorFixture = Extract<Fixture, { kind: 'actor' }>;
export type ItemFixture = Extract<Fixture, { kind: 'item' }>;

/** The three fields a stat block does not carry: who it is in this situation and how it starts. */
export type ActorPlacement = {
  id: string;
  /** Omitted starts at full health; a scenario that opens mid-fight says otherwise. */
  hpCurrent?: number | undefined;
  conditions?: string[] | undefined;
};

export function actorFromFixture(fixture: ActorFixture, placement: ActorPlacement): Actor {
  return {
    ...fixture.data,
    id: placement.id,
    hpCurrent: placement.hpCurrent ?? fixture.data.hp,
    conditions: placement.conditions ?? [],
  };
}

export function itemFromFixture(fixture: ItemFixture): Item {
  return { slug: fixture.slug, ...fixture.data };
}
