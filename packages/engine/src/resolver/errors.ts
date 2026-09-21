/**
 * The one failure the resolver throws on. Everything else a stack can get wrong is a
 * `Conflict` in the resolved profile, so `/profiles` can show it (FR-12); an incompatible
 * stack has no resolution to show, so it fails outright (VR-3).
 */

/** Discriminated so a caller — the `/profiles` page — can word the failure itself. */
export type IncompatibleStackReason =
  | { kind: 'empty-stack' }
  | { kind: 'base-not-first'; layer: string; version: string }
  | { kind: 'layer-expected'; layer: string; version: string; position: number }
  | { kind: 'duplicate-ruleset'; layer: string; version: string; position: number }
  | { kind: 'base-mismatch'; layer: string; version: string; declared: string; base: string }
  | { kind: 'unsupported-range'; layer: string; version: string; range: string }
  | {
      kind: 'range-unsatisfied';
      layer: string;
      version: string;
      range: string;
      base: string;
      baseVersion: string;
    };

function describe(reason: IncompatibleStackReason): string {
  switch (reason.kind) {
    case 'empty-stack':
      return 'a profile needs at least a base ruleset version';
    case 'base-not-first':
      return `${reason.layer}@${reason.version} is at position 0 of the stack but is not a base: position 0 must be a base with no \`extends\``;
    case 'layer-expected':
      return `${reason.layer}@${reason.version} is at position ${reason.position} of the stack but is not a layer: only position 0 may be a base`;
    case 'duplicate-ruleset':
      return `${reason.layer}@${reason.version} appears twice in the stack, at position ${reason.position}`;
    case 'base-mismatch':
      return `layer ${reason.layer}@${reason.version} extends ${reason.declared}, but the base of this stack is ${reason.base}`;
    case 'unsupported-range':
      return `layer ${reason.layer}@${reason.version} declares the range "${reason.range}", which is not a semver range this engine can read`;
    case 'range-unsatisfied':
      return `layer ${reason.layer}@${reason.version} needs ${reason.base} "${reason.range}", but the base of this stack is ${reason.baseVersion}`;
  }
}

export class IncompatibleStackError extends Error {
  /** Stable across message wording, for callers that branch on the failure. */
  readonly code = 'INCOMPATIBLE_STACK';
  readonly reason: IncompatibleStackReason;

  constructor(reason: IncompatibleStackReason) {
    super(describe(reason));
    this.name = 'IncompatibleStackError';
    this.reason = reason;
  }
}
