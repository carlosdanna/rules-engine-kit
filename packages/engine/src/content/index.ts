/**
 * The authored-YAML shape and the schema shape are not the same shape, and this is where
 * they are reconciled (`docs/content-authoring.md`, ADR-0020). Pure: parsing YAML and
 * reading files happens outside `src/`.
 */

export { ContentNormalizeError, type NormalizeErrorReason } from './errors';
export { type AuthoredPack, normalizePack } from './normalize';
