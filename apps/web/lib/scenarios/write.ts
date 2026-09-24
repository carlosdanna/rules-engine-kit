import 'server-only';

/**
 * Creating, editing and deleting a user scenario (FR-18, ADR-0029).
 *
 * The app's first write path. Three things make it what it is.
 *
 * **Every function takes `db` first.** Not `getDb()` — that reads a module-level handle on the
 * real `data/app.db`, and a test that called it would write to the database Playwright runs
 * against. Taking the handle as an argument is what lets `write.test.ts` drive all of this
 * against an in-memory database and what keeps the dev data clean.
 *
 * **The server renders; the client's preview is never trusted.** In template mode the action
 * re-reads the template and fixtures from the database and calls `renderTemplate` again, storing
 * *that* situation. A server action is a public POST endpoint, so what arrives is input, not
 * evidence — and re-rendering is cheap.
 *
 * **A seeded row is refused here, not merely hidden in the UI.** `origin = 'seed'` rows are
 * rebuilt from `content/` on every `db:reset` (ADR-0004), so an edit would be silently lost;
 * refusing in the writer means the guarantee does not depend on which button was rendered.
 */

import {
  type Db,
  evaluations,
  type ScenarioInput,
  type ScenarioRow,
  scenarios,
  type TemplateRow,
  uniqueSlug,
} from '@rules-engine-kit/db';
import {
  buildFixtureIndex,
  type Fixture,
  renderTemplate,
  SITUATION_SCHEMA_VERSION,
  type Situation,
  type Template,
  TemplateRenderError,
} from '@rules-engine-kit/engine';
import { count, eq } from 'drizzle-orm';
import type { ActionResult, FieldErrors, SavedScenario } from './types';

const fail = (formErrors: string[], fieldErrors: FieldErrors = {}): ActionResult<never> => ({
  ok: false,
  formErrors,
  fieldErrors,
});

/** A `TemplateRow` is a `Template` plus the columns the database needs; rendering wants the latter. */
export function templateFromRow(row: TemplateRow): Template {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    tags: row.tags,
    schemaVersion: row.schemaVersion as Template['schemaVersion'],
    suggestedProfiles: row.suggestedProfiles,
    params: row.paramsSchema,
    skeleton: row.skeleton,
  };
}

/**
 * A render failure, keyed to the control that caused it.
 *
 * `TemplateRenderError.path` is dotted and already speaks the author's vocabulary — it is what
 * `content:lint` prints — so `params.rangeFt` becomes an error on the `rangeFt` control and
 * anything else (`skeleton.…`, a fixture that resolves to nothing under this profile) becomes a
 * form-level message rather than being attached to a control it is not about.
 */
export function renderErrorToResult(error: TemplateRenderError): ActionResult<never> {
  const param = /^params\.(.+)$/.exec(error.path);
  if (param?.[1] !== undefined) {
    return fail([], { [`params.${param[1]}`]: error.message });
  }
  return fail([`${error.reason}: ${error.message}`]);
}

export type RenderSources = {
  template: TemplateRow | null;
  fixtures: readonly Fixture[];
};

/**
 * The situation a save stores, whichever arm the input took.
 *
 * The literal arm is already a parsed `Situation` — `ScenarioInput` validated it — so there is
 * nothing left to do to it. The template arm renders.
 */
export function situationFor(
  input: ScenarioInput,
  sources: RenderSources,
): ActionResult<{
  situation: Situation;
  templateId: string | null;
  params: Record<string, unknown> | null;
}> {
  if (input.body.kind === 'literal') {
    return { ok: true, data: { situation: input.body.situation, templateId: null, params: null } };
  }

  const { template } = sources;
  if (template === null) {
    return fail([`no template '${input.body.templateId}' is seeded`]);
  }

  try {
    const situation = renderTemplate(
      templateFromRow(template),
      input.body.params,
      buildFixtureIndex(sources.fixtures),
      input.body.profile,
    );
    return {
      ok: true,
      data: { situation, templateId: template.id, params: input.body.params },
    };
  } catch (thrown) {
    if (thrown instanceof TemplateRenderError) return renderErrorToResult(thrown);
    throw thrown;
  }
}

/** Every id already spoken for, seeded and user alike (ADR-0029). */
function takenIds(db: Db): Set<string> {
  return new Set(
    db
      .select({ id: scenarios.id })
      .from(scenarios)
      .all()
      .map((row) => row.id),
  );
}

export function createUserScenario(
  db: Db,
  input: ScenarioInput,
  sources: RenderSources,
): ActionResult<SavedScenario> {
  const resolved = situationFor(input, sources);
  if (!resolved.ok) return resolved;

  const taken = takenIds(db);
  if (taken.has(input.slug)) {
    return fail([], { slug: `'${input.slug}' is taken — try '${uniqueSlug(input.slug, taken)}'` });
  }

  const { situation, templateId, params } = resolved.data;
  db.insert(scenarios)
    .values({
      id: input.slug,
      name: input.name,
      situation,
      templateId,
      params,
      origin: 'user',
      schemaVersion: situation.schemaVersion,
    })
    .run();

  return { ok: true, data: { slug: input.slug } };
}

/**
 * Editing one. The slug is the primary key and ADR-0027 says a slug is never renamed in place,
 * so this updates everything else and leaves the id alone; renaming is a new scenario.
 */
export function updateUserScenario(
  db: Db,
  slug: string,
  input: ScenarioInput,
  sources: RenderSources,
): ActionResult<SavedScenario> {
  const existing = db.select().from(scenarios).where(eq(scenarios.id, slug)).all()[0];
  if (existing === undefined) return fail([`no scenario '${slug}'`]);
  if (existing.origin === 'seed') return fail([SEEDED_IS_READ_ONLY]);

  const resolved = situationFor(input, sources);
  if (!resolved.ok) return resolved;

  const { situation, templateId, params } = resolved.data;
  db.update(scenarios)
    .set({
      name: input.name,
      situation,
      templateId,
      params,
      schemaVersion: situation.schemaVersion,
    })
    .where(eq(scenarios.id, slug))
    .run();

  return { ok: true, data: { slug } };
}

export const SEEDED_IS_READ_ONLY =
  'that scenario comes from `scenarios/` and is rebuilt by `pnpm db:reset` (ADR-0004) — duplicate it instead';

export function deleteUserScenario(db: Db, slug: string): ActionResult<null> {
  const existing = db.select().from(scenarios).where(eq(scenarios.id, slug)).all()[0];
  if (existing === undefined) return fail([`no scenario '${slug}'`]);
  if (existing.origin === 'seed') return fail([SEEDED_IS_READ_ONLY]);

  // A stored run is evidence (VR-7), and its `scenario_id` would dangle; refuse rather than
  // delete it silently (ADR-0030).
  const runs =
    db.select({ n: count() }).from(evaluations).where(eq(evaluations.scenarioId, slug)).all()[0]
      ?.n ?? 0;
  if (runs > 0) {
    return fail([
      `${runs} stored run${runs === 1 ? ' references' : 's reference'} this scenario, so it cannot be deleted`,
    ]);
  }

  db.delete(scenarios).where(eq(scenarios.id, slug)).run();
  return { ok: true, data: null };
}

/**
 * What the editor opens with when duplicating or editing (ADR-0029).
 *
 * A template-backed row normally reopens in the template form, prefilled — that is what keeps a
 * duplicate re-renderable. But `resolveParams` rejects a param the template no longer declares,
 * so a row saved before its template changed would throw here. That is handled once, at the read
 * boundary, by degrading to the stored situation: it is always still valid, because a situation
 * is closed over its content (ADR-0017). Nothing is lost but the link.
 */
export type EditorSeed =
  | { mode: 'template'; templateId: string; params: Record<string, unknown>; drifted: false }
  | { mode: 'literal'; situation: Situation; drifted: boolean };

export function editorSeedFor(row: ScenarioRow, template: TemplateRow | null): EditorSeed {
  if (row.templateId === null || row.params === null || template === null) {
    return { mode: 'literal', situation: row.situation, drifted: false };
  }

  try {
    // Checks the stored params against the template as it is *now*, which is the drift test.
    renderTemplate(
      templateFromRow(template),
      row.params,
      buildFixtureIndex([]),
      template.suggestedProfiles[0] ?? '',
    );
  } catch (thrown) {
    if (thrown instanceof TemplateRenderError && thrown.reason === 'param-type') {
      return { mode: 'literal', situation: row.situation, drifted: true };
    }
    // Any other render failure is about fixtures, not params: the params still fit the form.
  }

  return { mode: 'template', templateId: row.templateId, params: row.params, drifted: false };
}

/** A row stored under a superseded schema version cannot be parsed, so it cannot be edited (VR-8). */
export const isEditable = (row: ScenarioRow): boolean =>
  row.origin === 'user' && row.schemaVersion === SITUATION_SCHEMA_VERSION;
