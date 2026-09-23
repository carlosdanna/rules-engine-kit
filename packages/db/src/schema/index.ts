/**
 * Every table in `architecture.md` § Data model, as Drizzle declares them.
 *
 * Two things hold across all of them. JSON columns are `text({ mode: 'json' })` typed with the
 * engine's Zod-inferred types, so a shape is declared once and this package never gets a second
 * opinion about what a `Trace` is. And every seeded row's primary key is a deterministic text
 * id derived from the natural key the content already carries (ADR-0027), which is what makes
 * "reseeding twice yields identical rows" structural and what lets a user evaluation keep its
 * foreign keys across a `db:reset`.
 *
 * There are no timestamp columns. A clock in a seeded row would make two rebuilds differ for a
 * reason nothing in `content/` changed.
 */

export * from './content';
export * from './profiles';
export * from './rulesets';
export * from './scenarios';
export * from './sources';
