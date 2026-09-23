/**
 * `ruleset_versions.content_hash` (ADR-0027, VR-1).
 *
 * Taken over the *normalised* `RulesetVersion` — identity, fact registry and authored rule
 * entries — in the canonical spelling `packages/engine/src/resolver/canonical.ts` defines, and
 * hashed with the engine's own SHA-256. `resolver/index.ts` says in so many words that both are
 * exported for this caller, so there is one definition of "canonical" in the repository rather
 * than one per package.
 *
 * It is not the profile hash and does not replace it: this says what was *authored*, ADR-0009's
 * hash says what the merge *produced*.
 */

import type { RulesetVersion } from '@rules-engine-kit/engine';
import { canonicalJson, sha256Hex } from '@rules-engine-kit/engine';

export function contentHashOf(pack: RulesetVersion): string {
  return `sha256:${sha256Hex(canonicalJson(pack))}`;
}
