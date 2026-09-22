/**
 * One error for every way a template fails to become a `Situation`, carrying the path to the
 * offending node so a message names a place in the YAML rather than a position in a parsed
 * object — the same bargain `ContentNormalizeError` makes, for the same reader.
 *
 * `content:lint` turns each of these into one issue against the template's file (FR-17), so
 * the reasons below are the vocabulary an author sees when a template does not render.
 */

export type TemplateRenderErrorReason =
  /** A `{{name}}` naming no param, or a malformed `{{$rollId(...)}}`. */
  | 'unknown-placeholder'
  /** A supplied param whose value does not match its declared type. */
  | 'param-type'
  /** No fixture with this slug is scoped to the profile being rendered. */
  | 'fixture-unscoped'
  /** More than one variant of a slug is scoped to it, so the reference means two things. */
  | 'fixture-ambiguous'
  /** A fixture resolved, but as an actor where an item was wanted, or the reverse. */
  | 'fixture-kind'
  /** The skeleton is not shaped like a situation: a missing `actors`, a step with no id. */
  | 'skeleton-shape'
  /** The assembled object did not pass `Situation.parse`. Carries Zod's own message. */
  | 'invalid-situation';

export class TemplateRenderError extends Error {
  readonly code = 'TEMPLATE_RENDER';
  readonly reason: TemplateRenderErrorReason;
  /** Dotted path into the skeleton or the params, e.g. `skeleton.timeline[1].action.weapon`. */
  readonly path: string;

  constructor(reason: TemplateRenderErrorReason, path: string, detail: string) {
    super(`${path}: ${detail}`);
    this.name = 'TemplateRenderError';
    this.reason = reason;
    this.path = path;
  }
}
