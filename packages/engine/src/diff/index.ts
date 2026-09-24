/**
 * Outcome, trace and ruleset diffs (FR-16, VR-9). Pure comparisons over values the engine
 * already produced; nothing here evaluates.
 */

export { diffOutcomes, type OutcomeDiff, type ValueDiff } from './outcomes';
export { diffRulesets, type FieldDiff, type RulesetDiff } from './rulesets';
export {
  alignmentKey,
  diffTraces,
  type EventAlignment,
  type RuleRef,
  type TraceDiff,
} from './traces';
