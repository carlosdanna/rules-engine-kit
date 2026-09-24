/**
 * The edits the scenario form makes to a literal situation (FR-18), as pure functions.
 *
 * Each takes a `Situation` that parses and returns one that still does: the form only renders
 * while the JSON text parses, so an edit that broke the schema — a step left pointing at an
 * actor that was just removed — would take the form away from the person using it. The
 * cascades below are what keep that from happening, and the tests beside this file hold each
 * of them to it.
 *
 * Browser-safe: no `server-only`, and the engine it imports is pure (NFR-3).
 */

import {
  type Action,
  type ActorFixture,
  actorFromFixture,
  type ItemFixture,
  itemFromFixture,
  type Situation,
} from '@rules-engine-kit/engine';

export type ActionType = Action['type'];

/** `base`, else `base-2`, `base-3`… — ids are what steps, targets and roll ids address. */
export function freshId(taken: Iterable<string>, base: string): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n += 1) {
    if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
  }
}

const actorIds = (situation: Situation): string[] => situation.actors.map((actor) => actor.id);

export function addActorFromFixture(situation: Situation, fixture: ActorFixture): Situation {
  const id = freshId(actorIds(situation), fixture.slug);
  return { ...situation, actors: [...situation.actors, actorFromFixture(fixture, { id })] };
}

/** A copy of the first actor's numbers under a fresh id: quicker to adjust than to type out. */
export function addBlankActor(situation: Situation): Situation {
  const [first] = situation.actors;
  if (first === undefined) return situation;
  const id = freshId(actorIds(situation), `actor-${situation.actors.length + 1}`);
  return {
    ...situation,
    actors: [
      ...situation.actors,
      { ...first, id, name: `Actor ${situation.actors.length + 1}`, conditions: [] },
    ],
  };
}

/** What is left of an action once `gone` is no longer in the situation. */
function withoutTarget(action: Action | null, gone: string): Action | null {
  if (action === null) return null;
  if (action.type === 'attack') return action.targetId === gone ? null : action;
  if (action.type === 'cast') {
    const targetIds = action.targetIds.filter((id) => id !== gone);
    return targetIds.length === 0 ? null : { ...action, targetIds };
  }
  return action;
}

/**
 * Steps the actor takes go with it; actions aimed at it lose that target, and an action left
 * with no target becomes no action. The schema requires one step, so removing the only actor
 * who acts is refused by returning the situation unchanged.
 */
export function removeActor(situation: Situation, index: number): Situation {
  const gone = situation.actors[index]?.id;
  if (gone === undefined || situation.actors.length === 1) return situation;

  const timeline = situation.timeline
    .filter((step) => step.actorId !== gone)
    .map((step) => ({ ...step, action: withoutTarget(step.action, gone) }));
  if (timeline.length === 0) return situation;

  return { ...situation, actors: situation.actors.filter((_, at) => at !== index), timeline };
}

export function addItemFromFixture(situation: Situation, fixture: ItemFixture): Situation {
  if (situation.items[fixture.slug] !== undefined) return situation;
  return { ...situation, items: { ...situation.items, [fixture.slug]: itemFromFixture(fixture) } };
}

/** An attack with a weapon that is no longer inlined would not parse (ADR-0017); it goes unarmed. */
export function removeItem(situation: Situation, slug: string): Situation {
  const items = Object.fromEntries(Object.entries(situation.items).filter(([key]) => key !== slug));
  const timeline = situation.timeline.map((step) =>
    step.action?.type === 'attack' && step.action.weapon === slug
      ? { ...step, action: { ...step.action, weapon: null } }
      : step,
  );
  return { ...situation, items, timeline };
}

/** A new step for the first actor, one round after the last step. */
export function addStep(situation: Situation): Situation {
  const last = situation.timeline.at(-1);
  const actorId = situation.actors[0]?.id ?? 'actor';
  const round = (last?.round ?? 0) + 1;
  const id = freshId(
    situation.timeline.map((step) => step.id),
    `r${round}-${actorId}`,
  );
  return { ...situation, timeline: [...situation.timeline, { id, round, actorId, action: null }] };
}

export function setAction(situation: Situation, index: number, action: Action | null): Situation {
  return {
    ...situation,
    timeline: situation.timeline.map((step, at) => (at === index ? { ...step, action } : step)),
  };
}

/**
 * A starting point for each action type that parses as it stands. Attacks and casts aim at the
 * first actor who is not the one taking the step, since that is almost always what is meant;
 * an attack picks the first inlined weapon, or none.
 */
export function defaultAction(
  situation: Situation,
  index: number,
  type: ActionType | null,
): Action | null {
  const self = situation.timeline[index]?.actorId;
  const other = situation.actors.find((actor) => actor.id !== self)?.id ?? self ?? 'actor';

  switch (type) {
    case null:
      return null;
    case 'attack':
      return {
        type,
        mode: 'melee',
        targetId: other,
        weapon: Object.keys(situation.items)[0] ?? null,
        rangeFt: 5,
      };
    case 'cast':
      return { type, spell: 'bless', targetIds: [other] };
    case 'check':
      return { type, ability: 'str', skill: null, dc: 10 };
    case 'save':
      return { type, ability: 'dex', dc: 10 };
    case 'useObject':
      return { type };
  }
}

/** A named intent (ADR-0003). Switching one off removes the key rather than storing `false`. */
export function setIntent(situation: Situation, name: string, on: boolean): Situation {
  const { [name]: _dropped, ...rest } = situation.intents;
  return { ...situation, intents: on ? { ...rest, [name]: true } : rest };
}
