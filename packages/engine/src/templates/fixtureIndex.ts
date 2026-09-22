import type { Fixture, FixtureKind } from '../schema';
import { TemplateRenderError } from './errors';

/**
 * The type Q24 asked for: what indexes a fixture slug to one variant under a profile
 * (ADR-0017, ADR-0026).
 *
 * A slug is not unique on its own — `goblin` is two files, one per edition, because the stat
 * block genuinely differs — so the question a renderer asks is always
 * `(slug, kind, profileSlug)`. Resolving to zero variants or to more than one is an error
 * rather than a pick, because either one means a template would render differently depending
 * on which file a loader happened to read first.
 */
export type FixtureIndex = {
  /** Throws `TemplateRenderError` rather than returning null: a template names what it needs. */
  resolve(slug: string, kind: FixtureKind, profileSlug: string, path: string): Fixture;
  /** Every variant of a slug scoped to a profile. What `content:lint` counts. */
  variants(slug: string, profileSlug: string): Fixture[];
};

/** Keyed `slug\u0000profileSlug`; a fixture appears once per profile its scope names. */
function key(slug: string, profileSlug: string): string {
  return `${slug}\u0000${profileSlug}`;
}

export function buildFixtureIndex(fixtures: readonly Fixture[]): FixtureIndex {
  const byScope = new Map<string, Fixture[]>();

  for (const fixture of fixtures) {
    for (const profileSlug of fixture.rulesetScope) {
      const bucket = byScope.get(key(fixture.slug, profileSlug));
      if (bucket === undefined) {
        byScope.set(key(fixture.slug, profileSlug), [fixture]);
      } else {
        bucket.push(fixture);
      }
    }
  }

  const variants = (slug: string, profileSlug: string): Fixture[] =>
    byScope.get(key(slug, profileSlug)) ?? [];

  return {
    variants,
    resolve(slug, kind, profileSlug, path) {
      const found = variants(slug, profileSlug);
      const [fixture] = found;

      if (fixture === undefined) {
        throw new TemplateRenderError(
          'fixture-unscoped',
          path,
          `no fixture '${slug}' is scoped to profile '${profileSlug}'`,
        );
      }
      if (found.length > 1) {
        throw new TemplateRenderError(
          'fixture-ambiguous',
          path,
          `${found.length} fixtures named '${slug}' are scoped to profile '${profileSlug}'; ` +
            'a slug must resolve to exactly one variant (ADR-0017)',
        );
      }

      if (fixture.kind !== kind) {
        throw new TemplateRenderError(
          'fixture-kind',
          path,
          `fixture '${slug}' is an ${fixture.kind}, but the template wants an ${kind}`,
        );
      }
      return fixture;
    },
  };
}
