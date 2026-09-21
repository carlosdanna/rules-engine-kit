# ADR-0002: Pure, deterministic engine package

- Status: accepted
- Date: 2026-09-21

## Context
The demo's value is explainable, reproducible results and comparing rule versions.

## Decision
`packages/engine` has no I/O, clock, global randomness or framework imports. All randomness comes from an injected seeded RNG; state updates are immutable. The app and DB packages pass plain objects in and persist outcomes.

## Consequences
Engine is testable with golden files and runs in Node and the browser. Evaluations store seed, profile hash, `engine_version` and `trace_schema_version` so replays are honest about version changes.
