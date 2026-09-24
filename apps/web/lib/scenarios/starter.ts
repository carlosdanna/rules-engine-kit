/**
 * The guided blank slate (FR-18): a profile, the stat blocks to start with, and whether the
 * first of them opens with an attack. What comes back is a literal situation like any other —
 * the profile only picks which fixture variant each slug resolves to (ADR-0026) and is not
 * stored (ADR-0028).
 *
 * Every picked actor gets one round-1 step, in the order picked, so the timeline reads as
 * initiative order from the start and each can be given an action in the form.
 *
 * Throws `TemplateRenderError` for a slug with no variant under the profile, the same error a
 * template names a missing fixture with; the page turns it into a 404.
 */

import {
  type ActorFixture,
  actorFromFixture,
  blankSituation,
  buildFixtureIndex,
  type Fixture,
  SITUATION_SCHEMA_VERSION,
  type Situation,
} from '@rules-engine-kit/engine';
import { defaultAction, freshId, setAction } from './situation-edits';

export type StarterAction = 'none' | 'attack';

export type StarterInput = {
  fixtures: readonly Fixture[];
  profile: string;
  actorSlugs: readonly string[];
  action: StarterAction;
};

export function starterSituation({
  fixtures,
  profile,
  actorSlugs,
  action,
}: StarterInput): Situation {
  if (actorSlugs.length === 0) return blankSituation();

  const index = buildFixtureIndex(fixtures);
  const taken: string[] = [];
  const actors = actorSlugs.map((slug, at) => {
    const fixture = index.resolve(slug, 'actor', profile, `actors[${at}]`) as ActorFixture;
    const id = freshId(taken, slug);
    taken.push(id);
    return actorFromFixture(fixture, { id });
  });

  const situation: Situation = {
    schemaVersion: SITUATION_SCHEMA_VERSION,
    actors,
    items: {},
    timeline: actors.map((actor) => ({
      id: `r1-${actor.id}`,
      round: 1,
      actorId: actor.id,
      action: null,
    })),
    intents: {},
  };

  return action === 'attack'
    ? setAction(situation, 0, defaultAction(situation, 0, 'attack'))
    : situation;
}
