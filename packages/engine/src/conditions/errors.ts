/**
 * The failures condition evaluation throws on. A false condition is a *result*, not an
 * error — it becomes `SkipReason.conditionFalse` in the trace. These three are authoring
 * or wiring bugs that must not resolve to a silent `null` (FR-17, ADR-0013).
 *
 * Each message is worded by a `describe*` function so the `content:lint` report and the
 * run-time error read identically for the same mistake (ADR-0013 §Consequences).
 */

export function describeUnknownFact(path: string, pointer: string): string {
  return `unknown fact path '${path}' at ${pointer}: every \`var\` must be registered in the pack's facts.yaml`;
}

/** A `var` naming a path the pack never registered. */
export class UnknownFactError extends Error {
  /** Stable across message wording, for callers that branch on the failure. */
  readonly code = 'UNKNOWN_FACT';
  readonly path: string;
  /** JSON pointer of the offending `var`, e.g. `/all/1/==/0`. */
  readonly pointer: string;

  constructor(path: string, pointer: string) {
    super(describeUnknownFact(path, pointer));
    this.name = 'UnknownFactError';
    this.path = path;
    this.pointer = pointer;
  }
}

/** A registered path whose value did not match the Zod type the pack declared for it. */
export class FactTypeError extends Error {
  readonly code = 'FACT_TYPE';
  readonly path: string;
  readonly pointer: string;
  /** Zod's account of the mismatch, for the lint report. */
  readonly issues: readonly { readonly path: readonly PropertyKey[]; readonly message: string }[];

  constructor(
    path: string,
    pointer: string,
    issues: readonly { readonly path: readonly PropertyKey[]; readonly message: string }[],
  ) {
    const detail = issues.map((issue) => issue.message).join('; ');
    super(`fact '${path}' at ${pointer} does not match its registered type: ${detail}`);
    this.name = 'FactTypeError';
    this.path = path;
    this.pointer = pointer;
    this.issues = issues;
  }
}

/** Two definitions for one path: the registry is the single definition of what a path means. */
export class DuplicateFactError extends Error {
  readonly code = 'DUPLICATE_FACT';
  readonly path: string;

  constructor(path: string) {
    super(`fact path '${path}' is registered twice`);
    this.name = 'DuplicateFactError';
    this.path = path;
  }
}

export type ConditionTypeErrorReason =
  | { kind: 'not-orderable'; operator: string; operand: string }
  | { kind: 'not-comparable'; operator: string; operand: string }
  | { kind: 'not-a-set'; operand: string };

function describeConditionType(reason: ConditionTypeErrorReason, pointer: string): string {
  switch (reason.kind) {
    case 'not-orderable':
      return `\`${reason.operator}\` at ${pointer} needs two numbers, got ${reason.operand}: comparisons are strict, with no coercion`;
    case 'not-comparable':
      return `\`${reason.operator}\` at ${pointer} cannot compare ${reason.operand}: only primitives compare, and a list is only meaningful to \`in\``;
    case 'not-a-set':
      return `\`in\` at ${pointer} needs a list on the right, got ${reason.operand}`;
  }
}

/**
 * An operator applied to an operand it has no meaning for — ordering two strings, or
 * `in` against something that is not a list. Strictness is the point: JavaScript would
 * happily order strings and give an answer nobody authored.
 */
export class ConditionTypeError extends Error {
  readonly code = 'CONDITION_TYPE';
  readonly pointer: string;
  readonly reason: ConditionTypeErrorReason;

  constructor(reason: ConditionTypeErrorReason, pointer: string) {
    super(describeConditionType(reason, pointer));
    this.name = 'ConditionTypeError';
    this.pointer = pointer;
    this.reason = reason;
  }
}

export function describeUnsupportedOperator(operator: string, pointer: string): string {
  return `unsupported operator '${operator}' at ${pointer}: conditions are a closed subset of JSON Logic (ADR-0013)`;
}
