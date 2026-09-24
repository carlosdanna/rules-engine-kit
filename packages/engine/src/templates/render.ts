import type { Actor, Item, Json, Situation, Template } from '../schema';
import { SITUATION_SCHEMA_VERSION, Situation as SituationSchema } from '../schema';
import { TemplateRenderError } from './errors';
import type { FixtureIndex } from './fixtureIndex';
import { type ActorFixture, actorFromFixture, type ItemFixture, itemFromFixture } from './inline';
import { resolveParams } from './params';
import { type StepActors, substitute } from './placeholders';

/**
 * `renderTemplate(template, params, fixtures, profileSlug) → Situation` (FR-18, FR-19, FR-20).
 *
 * Pure, like everything under `src/`: it takes documents someone else parsed and returns a
 * value. Reading `content/` off a disk is `cli.ts`'s job or `packages/db`'s (ADR-0020).
 *
 * The result is **closed over its content** (ADR-0017): every actor carries its printed stats
 * and every weapon slug the timeline names is inlined into `items`, so a saved scenario replays
 * identically after a fixture is corrected. Taking a correction up means re-rendering from
 * `scenarios.template_id` and `scenarios.params`, which is the escape hatch and is deliberate.
 *
 * The last line is `Situation.parse`. That is what makes FR-20 a guarantee rather than a
 * promise this function makes about itself: a weapon slug with nothing behind it, a step naming
 * an actor that does not exist, a timeline whose rounds go backwards — all of them are already
 * schema errors, and rendering does not get to invent a second opinion about them.
 */

/** A skeleton actor: a fixture reference plus the three fields a fixture does not carry. */
type SkeletonActor = {
  fixture: string;
  id: string;
  hpCurrent: number | undefined;
  conditions: string[] | undefined;
};

function isObject(value: Json): value is { [key: string]: Json } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireObject(value: Json, path: string): { [key: string]: Json } {
  if (!isObject(value)) {
    throw new TemplateRenderError('skeleton-shape', path, 'expected a mapping');
  }
  return value;
}

function requireArray(value: Json, path: string): Json[] {
  if (!Array.isArray(value)) {
    throw new TemplateRenderError('skeleton-shape', path, 'expected a sequence');
  }
  return value;
}

/**
 * Who acts on each step, read *before* substitution so `{{$rollId(<stepId>, attack)}}` can be
 * expanded. Step ids and actor ids are skeleton structure rather than param values — a
 * template that parameterised them could not address its own rolls — so this walk sees them
 * literally and does not need the params.
 */
function readStepActors(timeline: Json[], path: string): StepActors {
  const actors = new Map<string, string>();

  for (const [index, entry] of timeline.entries()) {
    const step = requireObject(entry, `${path}[${index}]`);
    const { id, actorId } = step;
    if (typeof id !== 'string' || id.length === 0) {
      throw new TemplateRenderError('skeleton-shape', `${path}[${index}].id`, 'a step needs an id');
    }
    if (typeof actorId !== 'string' || actorId.length === 0) {
      throw new TemplateRenderError(
        'skeleton-shape',
        `${path}[${index}].actorId`,
        'a step needs an actorId',
      );
    }
    actors.set(id, actorId);
  }

  return actors;
}

function readSkeletonActor(node: Json, path: string): SkeletonActor {
  const actor = requireObject(node, path);
  const { fixture, id, hpCurrent, conditions } = actor;

  if (typeof fixture !== 'string' || fixture.length === 0) {
    throw new TemplateRenderError(
      'skeleton-shape',
      `${path}.fixture`,
      'a skeleton actor names the fixture slug it inlines',
    );
  }
  if (typeof id !== 'string' || id.length === 0) {
    throw new TemplateRenderError(
      'skeleton-shape',
      `${path}.id`,
      'a skeleton actor needs the id its steps and rules address it by',
    );
  }
  if (hpCurrent !== undefined && typeof hpCurrent !== 'number') {
    throw new TemplateRenderError('skeleton-shape', `${path}.hpCurrent`, 'expected a number');
  }
  if (conditions !== undefined && !Array.isArray(conditions)) {
    throw new TemplateRenderError('skeleton-shape', `${path}.conditions`, 'expected a sequence');
  }

  return {
    fixture,
    id,
    hpCurrent: hpCurrent as number | undefined,
    conditions: conditions as string[] | undefined,
  };
}

/**
 * Every weapon slug the timeline names, in the order it names them. Rendering inlines exactly
 * these: an item fixture nothing wields is not carried, because `situation.items` is an index
 * for `action.weapon` to point into rather than an inventory.
 */
function weaponSlugs(timeline: Json[], path: string): { slug: string; path: string }[] {
  const found: { slug: string; path: string }[] = [];

  for (const [index, entry] of timeline.entries()) {
    const step = requireObject(entry, `${path}[${index}]`);
    const action = step.action ?? null;
    if (!isObject(action)) continue;
    const { weapon } = action;
    if (typeof weapon !== 'string' || weapon.length === 0) continue;
    found.push({ slug: weapon, path: `${path}[${index}].action.weapon` });
  }

  return found;
}

export function renderTemplate(
  template: Template,
  params: unknown,
  fixtures: FixtureIndex,
  profileSlug: string,
): Situation {
  const resolved = resolveParams(template, params);
  const skeleton = requireObject(template.skeleton as Json, 'skeleton');

  // Structure first, placeholders second. The timeline's step and actor ids are what
  // `$rollId` needs, and they are literal by construction.
  const timeline = requireArray(skeleton.timeline ?? null, 'skeleton.timeline');
  const stepActors = readStepActors(timeline, 'skeleton.timeline');

  const rendered = requireObject(
    substitute(skeleton, resolved, stepActors, 'skeleton'),
    'skeleton',
  );
  const renderedTimeline = requireArray(rendered.timeline ?? null, 'skeleton.timeline');

  const actors: Actor[] = requireArray(rendered.actors ?? null, 'skeleton.actors').map(
    (node, index) => {
      const skeletonActor = readSkeletonActor(node, `skeleton.actors[${index}]`);
      const fixture = fixtures.resolve(
        skeletonActor.fixture,
        'actor',
        profileSlug,
        `skeleton.actors[${index}].fixture`,
      ) as ActorFixture;

      return actorFromFixture(fixture, skeletonActor);
    },
  );

  const items: Record<string, Item> = {};
  for (const { slug, path } of weaponSlugs(renderedTimeline, 'skeleton.timeline')) {
    if (items[slug] !== undefined) continue;
    items[slug] = itemFromFixture(fixtures.resolve(slug, 'item', profileSlug, path) as ItemFixture);
  }

  const candidate = {
    schemaVersion: SITUATION_SCHEMA_VERSION,
    actors,
    items,
    timeline: renderedTimeline,
    intents: rendered.intents ?? {},
  };

  const parsed = SituationSchema.safeParse(candidate);
  if (!parsed.success) {
    const [first] = parsed.error.issues;
    throw new TemplateRenderError(
      'invalid-situation',
      first === undefined ? 'skeleton' : `skeleton.${first.path.map(String).join('.')}`,
      first === undefined ? 'did not parse as a Situation' : first.message,
    );
  }
  return parsed.data;
}
