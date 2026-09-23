/**
 * The one error the loaders throw.
 *
 * It lives in its own module rather than in `load.ts` because `scenarios.ts` throws it too
 * and `load.ts` reads scenarios — importing it the other way would be a cycle.
 */
export class ContentLoadError extends Error {
  readonly code = 'CONTENT_LOAD';

  constructor(message: string) {
    super(message);
    this.name = 'ContentLoadError';
  }
}
