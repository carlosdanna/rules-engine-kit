import 'server-only';

/**
 * Previewing, saving and deleting a user profile (FR-2, FR-12, ADR-0031).
 *
 * The app's second write path, built like the first (`lib/scenarios/write.ts`, ADR-0029):
 * every function takes `db` first so `write.test.ts` runs against an in-memory database, and
 * the server resolves the stack itself rather than believing a hash the browser previewed.
 *
 * A stack that resolves is saved with whatever conflicts it reports. `resolveProfile` returns
 * them rather than refusing because each one is a choice an author may have made on purpose —
 * a later `add` replacing an earlier one is still a working profile. Only an incompatible
 * stack has no resolution to save.
 */

import {
  type Db,
  evaluations,
  isValidSlug,
  loadStack,
  profileLayers,
  profiles,
  uniqueSlug,
} from '@rules-engine-kit/db';
import {
  type Conflict,
  IncompatibleStackError,
  type IncompatibleStackReason,
  type ProfileSource,
  resolveProfile,
} from '@rules-engine-kit/engine';
import { count, eq } from 'drizzle-orm';
import type { ActionResult, FieldErrors } from '../scenarios/types';

const fail = (formErrors: string[], fieldErrors: FieldErrors = {}): ActionResult<never> => ({
  ok: false,
  formErrors,
  fieldErrors,
});

export type ProfilePreview =
  | { status: 'resolved'; hash: string; conflicts: Conflict[]; sources: ProfileSource[] }
  | { status: 'incompatible'; message: string; reason: IncompatibleStackReason };

export function previewProfile(
  db: Db,
  versionIds: readonly string[],
): ActionResult<ProfilePreview> {
  try {
    const { hash, conflicts, sources } = resolveProfile(loadStack(db, versionIds));
    return { ok: true, data: { status: 'resolved', hash, conflicts, sources } };
  } catch (thrown) {
    if (thrown instanceof IncompatibleStackError) {
      return {
        ok: true,
        data: { status: 'incompatible', message: thrown.message, reason: thrown.reason },
      };
    }
    return fail([(thrown as Error).message]);
  }
}

export type ProfileInput = { name: string; slug: string; versionIds: string[] };

export function createUserProfile(db: Db, input: ProfileInput): ActionResult<{ slug: string }> {
  const fieldErrors: FieldErrors = {};
  const name = input.name.trim();
  if (name === '') fieldErrors.name = 'a name is required';
  if (!isValidSlug(input.slug)) {
    fieldErrors.slug = 'lowercase letters, digits and single hyphens only';
  } else {
    const taken = new Set(
      db
        .select({ id: profiles.id })
        .from(profiles)
        .all()
        .map((row) => row.id),
    );
    if (taken.has(input.slug)) {
      fieldErrors.slug = `'${input.slug}' is taken — try '${uniqueSlug(input.slug, taken)}'`;
    }
  }

  const preview = previewProfile(db, input.versionIds);
  if (!preview.ok) return preview;
  if (preview.data.status === 'incompatible') fieldErrors.layers = preview.data.message;
  if (Object.keys(fieldErrors).length > 0 || preview.data.status !== 'resolved') {
    return fail([], fieldErrors);
  }

  const hash = preview.data.hash;
  db.transaction((tx) => {
    tx.insert(profiles).values({ id: input.slug, name, resolvedHash: hash, origin: 'user' }).run();
    tx.insert(profileLayers)
      .values(
        input.versionIds.map((rulesetVersionId, position) => ({
          profileId: input.slug,
          rulesetVersionId,
          position,
        })),
      )
      .run();
  });

  return { ok: true, data: { slug: input.slug } };
}

export const SEEDED_PROFILE_IS_READ_ONLY =
  'that profile comes from `content/profiles.yaml` and is rebuilt by `pnpm db:reset` (ADR-0004)';

export function deleteUserProfile(db: Db, id: string): ActionResult<null> {
  const existing = db.select().from(profiles).where(eq(profiles.id, id)).all()[0];
  if (existing === undefined) return fail([`no profile '${id}'`]);
  if (existing.origin === 'seed') return fail([SEEDED_PROFILE_IS_READ_ONLY]);

  // A stored run names its profile, and is evidence (VR-7); refuse, as for a scenario (ADR-0030).
  const runs =
    db.select({ n: count() }).from(evaluations).where(eq(evaluations.profileId, id)).all()[0]?.n ??
    0;
  if (runs > 0) {
    return fail([
      `${runs} stored run${runs === 1 ? ' references' : 's reference'} this profile, so it cannot be deleted`,
    ]);
  }

  db.transaction((tx) => {
    tx.delete(profileLayers).where(eq(profileLayers.profileId, id)).run();
    tx.delete(profiles).where(eq(profiles.id, id)).run();
  });
  return { ok: true, data: null };
}
