/**
 * What a file in `scenarios/` is (ADR-0028).
 *
 * A bare `Situation` would carry no slug, no name and — the reason that shape was rejected —
 * no record of the template and params it came from, so ADR-0017's "take a correction up by
 * re-rendering the scenario from its template and params" would have nothing to re-render.
 * An envelope carries all four, and the template form carries no situation at all: it is
 * rendered at load time through the same `renderTemplate` the golden cases use, so a template
 * change fails a test rather than leaving a stale copy of its output in `scenarios/`.
 *
 * `profile` is a render *input*, not a stored column. It is the profile slug the template is
 * rendered against, which is what picks a fixture variant (ADR-0026); which profile a saved
 * scenario is later *run* under is the user's choice, every time.
 *
 * This schema lives here rather than in `packages/engine/src/schema` because nothing pure
 * needs it: the engine is handed a `Situation`, and how one was stored on a disk is the
 * loader's business (ADR-0020).
 */

import { Situation } from '@rules-engine-kit/engine';
import { z } from 'zod';

const ScenarioFields = {
  /** Stable id and filename stem; `scenarios.slug` and the row's primary key (ADR-0027). */
  slug: z.string().min(1),
  name: z.string().min(1),
  /**
   * The profile the template renders against. Required on the template form and meaningless
   * on the literal one, where the situation is already closed over its content (ADR-0017).
   */
  profile: z.string().min(1),
};

/** Rendered at load time from a template and its params. Four lines, and it cannot go stale. */
const TemplateScenario = z.strictObject({
  ...ScenarioFields,
  /** A template `id`, as `content/templates/*.yaml` declares it. */
  template: z.string().min(1),
  /** Omitted renders with the template's declared defaults, which is what most of these do. */
  params: z.record(z.string().min(1), z.unknown()).default({}),
});

/**
 * A situation written out in full: what a user scenario exported to YAML comes back as
 * (ADR-0004), and what a blank-slate scenario is (FR-18). No `profile`, because there is
 * nothing left to render.
 */
const LiteralScenario = z.strictObject({
  slug: ScenarioFields.slug,
  name: ScenarioFields.name,
  situation: Situation,
});

export const ScenarioFile = z.union([TemplateScenario, LiteralScenario]);
export type ScenarioFile = z.infer<typeof ScenarioFile>;

export const isTemplateScenario = (file: ScenarioFile): file is z.infer<typeof TemplateScenario> =>
  'template' in file;

/** One scenario, ready to seed: the situation is resolved whichever form the file took. */
export type LoadedScenario = {
  slug: string;
  name: string;
  situation: Situation;
  /** `null` on a literal scenario — there is no template behind it to re-render from. */
  templateId: string | null;
  params: Record<string, unknown> | null;
};

/**
 * What the app is allowed to write (ADR-0029).
 *
 * These live beside `ScenarioFile` rather than in `apps/web` for two reasons. `zod` is not a
 * dependency of the web app and does not resolve from it, so a server action has no way to
 * build a schema of its own; and a saved scenario and an exported file are the same thing in
 * two shapes, so the rules about what a slug or a name may be belong in one place.
 *
 * `ScenarioBody` is the discriminated pair FR-18 creates: a template call, which the action
 * renders server-side, or a literal situation typed into the JSON tab. What gets stored is a
 * situation either way (ADR-0017) — the template arm additionally keeps `template_id` and
 * `params`, which is what a fixture correction is later taken up through.
 */

/** Lowercase, digits, single hyphens — what `slugify` produces, checked at the boundary. */
export const ScenarioSlug = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'a slug is lowercase words joined by single hyphens');

export const ScenarioName = z.string().trim().min(1).max(120);

export const ScenarioBody = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('template'),
    templateId: z.string().min(1),
    /** The profile the template renders against; a render input, never stored (ADR-0028). */
    profile: z.string().min(1),
    params: z.record(z.string().min(1), z.unknown()),
  }),
  z.strictObject({
    kind: z.literal('literal'),
    situation: Situation,
  }),
]);
export type ScenarioBody = z.infer<typeof ScenarioBody>;

export const ScenarioInput = z.strictObject({
  slug: ScenarioSlug,
  name: ScenarioName,
  body: ScenarioBody,
});
export type ScenarioInput = z.infer<typeof ScenarioInput>;
