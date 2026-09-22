/**
 * The validated data model shared by the engine, the DB package and the app: Zod schemas
 * and the types inferred from them, so there is one definition per concept rather than a
 * type and a validator that can drift (`docs/open-questions.md`, "schema drift").
 *
 * Content is authored in YAML (`docs/content-authoring.md`) and its loader normalises the
 * authoring shorthands — `anchor: source`, `dieSelector: intent`, `value: { dice: 1d4 }` —
 * into the canonical shapes here before parsing.
 */

export * from './condition';
export * from './effect';
export * from './fixture';
export * from './json';
export * from './outcome';
export * from './primitives';
export * from './rule';
export * from './ruleset';
export * from './situation';
export * from './template';
export * from './time';
export * from './trace';
