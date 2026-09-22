import { CONDITION_OPERATORS } from '../schema';
import { describeUnknownFact, describeUnsupportedOperator } from './errors';
import { childPointer, ROOT_POINTER } from './pointer';
import type { FactRegistry } from './registry';

export type UnknownPathIssue = { path: string; pointer: string; message: string };
export type UnsupportedOperatorIssue = { operator: string; pointer: string; message: string };

export type ConditionLintResult = {
  /** Every `var` naming a path the registry does not hold, in tree order. */
  unknownPaths: UnknownPathIssue[];
  /** Every operator outside the closed subset. */
  unsupportedOperators: UnsupportedOperatorIssue[];
};

function isNode(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Walks the same tree `evaluateCondition` walks, with values omitted, so lint and
 * evaluation can never disagree about what a path means (ADR-0013 §Consequences). The
 * differences are deliberate and both directions matter:
 *
 * - lint sees *every* branch, including ones evaluation would short-circuit past;
 * - lint collects rather than throws, so one pass reports every mistake in a file;
 * - lint takes `unknown`, because it runs on authored YAML before the Zod parse — which
 *   is the only way an unsupported operator can be reported at all.
 */
export function lintCondition(condition: unknown, registry: FactRegistry): ConditionLintResult {
  const result: ConditionLintResult = { unknownPaths: [], unsupportedOperators: [] };
  walk(condition, ROOT_POINTER, registry, result);
  return result;
}

function walk(
  node: unknown,
  container: string,
  registry: FactRegistry,
  result: ConditionLintResult,
): void {
  // A literal operand, or something malformed the Zod parse will reject on its own terms.
  if (!isNode(node)) return;

  const operator = Object.keys(node)[0];
  if (operator === undefined) return;

  // A `var` is an operand, so it is reported at the operand's pointer — the same pointer
  // `UnknownFactError` carries — rather than one level deeper at `…/var`.
  if (operator === 'var') {
    const path = node.var;
    if (typeof path === 'string' && !registry.has(path)) {
      result.unknownPaths.push({
        path,
        pointer: container,
        message: describeUnknownFact(path, container),
      });
    }
    return;
  }

  const pointer = childPointer(container, operator);
  if (!(CONDITION_OPERATORS as readonly string[]).includes(operator)) {
    result.unsupportedOperators.push({
      operator,
      pointer,
      message: describeUnsupportedOperator(operator, pointer),
    });
    return;
  }

  const operand = node[operator];
  if (operator === 'not') {
    walk(operand, pointer, registry, result);
    return;
  }

  if (Array.isArray(operand)) {
    for (const [index, child] of operand.entries()) {
      walk(child, childPointer(pointer, index), registry, result);
    }
  }
}
