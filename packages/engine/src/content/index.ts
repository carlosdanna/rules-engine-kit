/**
 * The authored-YAML shape and the schema shape are not the same shape, and this is where
 * they are reconciled (`docs/content-authoring.md`, ADR-0020). Pure: parsing YAML and
 * reading files happens outside `src/`.
 *
 * `normalizePack` is what a loader calls to build one `RulesetVersion` from a pack
 * directory. The per-document entry points beside it are what `content:lint` calls, so a
 * report can name the file a mistake is in rather than an index into an assembled object.
 */

export { ContentNormalizeError, type NormalizeErrorReason } from './errors';
export {
  type AuthoredPackDocs,
  type ContentDoc,
  type ContentDocs,
  type ContentIssue,
  type ContentIssueCode,
  lintContent,
} from './lint';
export {
  type AuthoredPack,
  normalizeFactsFile,
  normalizeFixture,
  normalizePack,
  normalizePackManifest,
  normalizeProfilesFile,
  normalizeRuleFile,
  normalizeTemplate,
} from './normalize';
