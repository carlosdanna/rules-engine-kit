/**
 * One error for every way an authored document fails to become a `RulesetVersion`, carrying
 * the path to the offending node so the message names a place in the YAML rather than a
 * position in a parsed object.
 */

export type NormalizeErrorReason =
  | 'not-an-object'
  | 'not-an-array'
  | 'unknown-shorthand'
  | 'dice-modifier'
  | 'missing-field';

export class ContentNormalizeError extends Error {
  readonly code = 'CONTENT_NORMALIZE';
  readonly reason: NormalizeErrorReason;
  /** Dotted path into the authored document, e.g. `rules[2].effects[0].value.dice`. */
  readonly path: string;

  constructor(reason: NormalizeErrorReason, path: string, detail: string) {
    super(`${path}: ${detail}`);
    this.name = 'ContentNormalizeError';
    this.reason = reason;
    this.path = path;
  }
}
