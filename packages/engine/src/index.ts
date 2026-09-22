/**
 * Pure, deterministic rules engine (ADR-0002): no I/O, clock, global randomness
 * or framework imports. Conditions and dice are implemented; the phase loop, effects,
 * stacking and trace modules land in M1 on top of them. The schema is the contract they,
 * the resolver and `packages/db` share.
 */

export * from './conditions';
export * from './content';
export * from './dice';
export * from './effects';
export * from './evaluator';
export * from './resolver';
export * from './schema';
export * from './stacking';
export * from './templates';
export * from './time';
export * from './trace';
export { ENGINE_VERSION, TRACE_SCHEMA_VERSION } from './version';
