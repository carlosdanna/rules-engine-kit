/**
 * The shapes a server action hands back to the browser (ADR-0029).
 *
 * In their own module because a `'use server'` file may export only async functions, and both
 * sides need these: the action builds one, the form renders it.
 *
 * Errors come back as data rather than as a thrown exception, because every one of them is
 * something the person typing can fix — a slug already taken, a number below its declared
 * minimum, a situation that does not parse. `fieldErrors` is keyed to match Base UI's
 * `<Form errors>`, which distributes by the `name` on each `<Field>`, so an action's answer
 * lands next to the control that caused it without the form mapping anything.
 */

import type { ScenarioInput } from '@rules-engine-kit/db';

export type { ScenarioInput };

/** Keyed by field name; a param control's name is `params.<paramName>`. */
export type FieldErrors = Record<string, string | string[]>;

export type ActionResult<T> =
  | { ok: true; data: T }
  /** `formErrors` is for what no single control owns: a render that failed as a whole. */
  | { ok: false; formErrors: string[]; fieldErrors: FieldErrors };

export type SavedScenario = { slug: string };

/** The initial `useActionState` value: nothing said yet, which is not the same as no errors. */
export const IDLE: ActionResult<never> | null = null;
