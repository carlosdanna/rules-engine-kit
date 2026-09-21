/**
 * Versions recorded on every evaluation so a replay is honest about what produced
 * it (VR-7). `packages/db` stores both alongside the seed and the profile hash.
 */

/**
 * Semver of the engine's behaviour, not of the package. Bump it whenever a change
 * could alter an outcome or a trace for an unchanged situation + profile + seed —
 * including the seed-to-stream mapping of the RNG, which is part of the
 * reproducibility contract (`docs/spike-notes.md` §3).
 */
export const ENGINE_VERSION = '0.0.0';

/**
 * Schema version of the trace envelope. Starts at 1: ADR-0014 corrected ADR-0010's
 * event list before anything was implemented, so no reader ever has to handle 0.
 * The viewer refuses to render a trace newer than the version it knows.
 */
export const TRACE_SCHEMA_VERSION = 1;
