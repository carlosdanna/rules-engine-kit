'use server';

/**
 * Previewing, saving and deleting a user profile from `/profiles` (ADR-0031).
 *
 * Thin, like `app/scenarios/actions.ts`: the rules live in `lib/profiles/write.ts`, which takes
 * its database as an argument. An action is a public POST endpoint, so the payload is checked
 * here — it is strings and a list of strings — and the stack is resolved again on the server
 * whatever the browser previewed.
 */

import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/db';
import {
  createUserProfile,
  deleteUserProfile,
  type ProfileInput,
  type ProfilePreview,
  previewProfile,
} from '@/lib/profiles/write';
import type { ActionResult } from '@/lib/scenarios/types';

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const malformed: ActionResult<never> = {
  ok: false,
  formErrors: ['malformed request'],
  fieldErrors: {},
};

export async function previewProfileAction(
  versionIds: unknown,
): Promise<ActionResult<ProfilePreview>> {
  if (!isStringList(versionIds)) return malformed;
  return previewProfile(getDb(), versionIds);
}

export async function createProfileAction(
  _previous: unknown,
  payload: ProfileInput,
): Promise<ActionResult<{ slug: string }>> {
  const { name, slug, versionIds } = (payload ?? {}) as Partial<ProfileInput>;
  if (typeof name !== 'string' || typeof slug !== 'string' || !isStringList(versionIds)) {
    return malformed;
  }
  const result = createUserProfile(getDb(), { name, slug: slug.trim(), versionIds });
  if (result.ok) {
    revalidatePath('/profiles');
    revalidatePath('/compare');
    revalidatePath('/playground');
  }
  return result;
}

export async function deleteProfileAction(id: unknown): Promise<ActionResult<null>> {
  if (typeof id !== 'string') return malformed;
  const result = deleteUserProfile(getDb(), id);
  if (result.ok) revalidatePath('/profiles');
  return result;
}
