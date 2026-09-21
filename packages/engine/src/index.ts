/**
 * Pure, deterministic rules engine (ADR-0002): no I/O, clock, global randomness
 * or framework imports. Evaluator, dice and trace modules land in M1; the schema is
 * the contract they, the resolver and `packages/db` share.
 */

export * from './resolver';
export * from './schema';
export { ENGINE_VERSION, TRACE_SCHEMA_VERSION } from './version';
