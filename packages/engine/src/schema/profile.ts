import { z } from 'zod';
import { Semver } from './primitives';

/**
 * A named, seeded profile: the ordered stack of ruleset versions a template suggests, a
 * fixture is scoped to and a citation names (ADR-0026, closing half of Q24).
 *
 * Packs identify themselves as `(id, semver)` — `dnd5e-srd` at `5.2.1` — but every template
 * and fixture in `content/` refers to `srd-5.2.1`, and until this type nothing said what that
 * string was. It is a profile slug, declared in `content/profiles.yaml`, and it is a *stack*
 * rather than a pack so that a layered profile is nameable: `srd-5.2.1+flanking` is the
 * acceptance scenario the house rule exists for (VR-2, VR-4).
 *
 * The stack is ordered, base first, exactly as `resolveProfile` wants it (ADR-0018). Nothing
 * here is hashed: the profile hash is the canonical JSON of the *resolved* rules and the layer
 * identities (ADR-0009), so renaming a profile slug does not invalidate a stored evaluation.
 */
export const ProfileLayerRef = z.strictObject({
  /** A pack's `id`, e.g. `dnd5e-srd`. */
  id: z.string().min(1),
  version: Semver,
});
export type ProfileLayerRef = z.infer<typeof ProfileLayerRef>;

export const ProfileManifest = z.strictObject({
  /** What `suggestedProfiles`, `rulesetScope` and `citation.source` name, e.g. `srd-5.1`. */
  slug: z.string().min(1),
  /** What the profile picker shows. */
  name: z.string().min(1),
  /** Ordered, base first. At least one: a profile with no rules resolves to nothing. */
  layers: z.array(ProfileLayerRef).min(1),
});
export type ProfileManifest = z.infer<typeof ProfileManifest>;
