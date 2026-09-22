/**
 * Layer merge, compatibility and the canonical profile hash (ADR-0009).
 *
 * `canonicalJson`, `sha256Hex` and the semver helpers are exported because `packages/db`
 * hashes pack content with the same definition of "canonical" (`ruleset_versions.content_hash`)
 * and the app shows compatibility before a profile is resolved.
 */

export { canonicalJson } from './canonical';
export { IncompatibleStackError, type IncompatibleStackReason } from './errors';
export { compareResolvedRules, resolveProfile } from './resolveProfile';
export { compareSemver, parseSemver, type SemverParts, satisfiesRange } from './semver';
export { sha256Hex } from './sha256';
