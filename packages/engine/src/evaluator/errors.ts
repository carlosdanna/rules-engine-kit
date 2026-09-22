/** Failures resolving a fact path against the world state. */

import type { Phase } from '../schema';

export type FactResolutionReason =
  | { kind: 'unresolved'; path: string }
  | { kind: 'derived-not-sealed'; path: string; phase: Phase }
  | { kind: 'no-target'; path: string };

export function describeFactResolution(reason: FactResolutionReason): string {
  switch (reason.kind) {
    case 'unresolved':
      return `fact path '${reason.path}' is registered but the engine cannot resolve it: this is an engine gap, not a content error`;
    case 'derived-not-sealed':
      return `derived path '${reason.path}' is not sealed yet, read during the \`${reason.phase}\` phase: derived values are assembled by the \`modifiers\` phase and sealed at the end of it, so reading one from within that phase would be forward chaining (ADR-0003)`;
    case 'no-target':
      return `'${reason.path}' needs the step's target, but this step's action declares none`;
  }
}

export class FactResolutionError extends Error {
  readonly code = 'FACT_RESOLUTION';
  readonly reason: FactResolutionReason;
  readonly path: string;

  constructor(reason: FactResolutionReason) {
    super(describeFactResolution(reason));
    this.name = 'FactResolutionError';
    this.reason = reason;
    this.path = reason.path;
  }
}
