/**
 * Pure, deterministic rules engine (ADR-0002): no I/O, clock, global randomness
 * or framework imports. Resolver, evaluator, dice and trace modules land in M1;
 * the schema is the contract they and `packages/db` share.
 */

export * from './schema';
export { ENGINE_VERSION, TRACE_SCHEMA_VERSION } from './version';
