/**
 * Minting a user scenario's primary key (ADR-0029).
 *
 * ADR-0027 settled that a seeded row's id is the slug the content authored, and carved out a
 * uuid only for `evaluations`, which is written at runtime and has no natural key. A user
 * scenario sits between the two: it is written at runtime, but it is a scenario, and
 * `/scenarios/<uuid>` and `<uuid>.yaml` read badly for something meant to be exported and
 * promoted into `scenarios/` (ADR-0004). So it gets a slug, derived from its name.
 *
 * The namespace is shared with seeded rows on purpose. `db:seed` deletes and re-inserts the
 * seeded slugs on every run, so a user row holding one of them would collide with content
 * coming back; deduping against every existing id is what makes that impossible rather than
 * unlikely.
 *
 * It lives at the package root rather than under `seed/` because `seed/ids.ts` is about ids
 * derived from content, and this is the one id derived from a person typing a name.
 */

/** What `slugify` produces and `uniqueSlug` preserves: lowercase, digits, single hyphens. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const isValidSlug = (slug: string): boolean => SLUG.test(slug);

/**
 * A name as a slug. Accents are folded rather than dropped, so `Mêlée` is `melee` and not
 * `mle`; everything else that is not a letter or a digit becomes a separator, and runs of
 * separators collapse.
 *
 * A name with nothing slug-shaped in it — punctuation, or blank — yields `scenario`, which
 * `uniqueSlug` then suffixes. Returning an empty string would produce a row with an empty
 * primary key, which SQLite accepts and nothing can address.
 */
export function slugify(name: string): string {
  const folded = name
    .normalize('NFKD')
    // Combining marks, so `Mêlée` folds to `melee` rather than losing the letters under them.
    .replace(/\p{M}/gu, '')
    .toLowerCase();

  const slug = folded
    // Apostrophes elide rather than separate, so `an apostrophe's fate` keeps its word count.
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return slug === '' ? 'scenario' : slug;
}

/**
 * `base`, or the first free `base-2`, `base-3`, … A gap below an occupied suffix is filled
 * rather than skipped, so the numbering stays as short as the collisions require.
 */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const held = taken instanceof Set ? taken : new Set(taken);
  if (!held.has(base)) return base;

  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!held.has(candidate)) return candidate;
  }
}
