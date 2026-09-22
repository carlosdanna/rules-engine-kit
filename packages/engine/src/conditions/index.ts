/**
 * Conditions: JSON Logic *syntax* over a closed operator set, evaluated by our own
 * one-pass evaluator (ADR-0013). `json-logic-js` is deliberately not a dependency — it
 * cannot report which facts a condition read, cannot name the sub-expression that
 * failed, and intercepting `var` means mutating module-level global state (ADR-0002).
 *
 * `evaluateCondition` and `lintCondition` walk the same tree: one with values, one
 * without, so `content:lint` (FR-17) and evaluation can never disagree about a path.
 */

export {
  ConditionTypeError,
  type ConditionTypeErrorReason,
  DuplicateFactError,
  describeUnknownFact,
  describeUnsupportedOperator,
  FactTypeError,
  UnknownFactError,
} from './errors';
export { evaluateCondition } from './evaluate';
export {
  type ConditionLintResult,
  lintCondition,
  type UnknownPathIssue,
  type UnsupportedOperatorIssue,
} from './lint';
export { childPointer, ROOT_POINTER } from './pointer';
export {
  createFactRegistry,
  type FactRegistry,
  type FactSource,
  factTypeSchema,
  type RegisteredFact,
  registryFromFacts,
} from './registry';
