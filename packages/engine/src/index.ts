/**
 * Pure, deterministic rules engine (ADR-0002): no I/O, clock, global randomness
 * or framework imports. Modules land in M1; M0 only fixes the package surface.
 */

/** Recorded on every evaluation so replays are honest about version changes (VR-7). */
export const ENGINE_VERSION = '0.0.0';

/** Schema version of the trace envelope, stored alongside `ENGINE_VERSION` (VR-7). */
export const TRACE_SCHEMA_VERSION = '0.0.0';
