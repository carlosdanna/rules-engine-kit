import type { Condition, ConditionResult, FactRead, Json, Operand } from '../schema';
import { ConditionTypeError, FactTypeError, UnknownFactError } from './errors';
import { childPointer, ROOT_POINTER } from './pointer';
import type { FactRegistry, FactSource } from './registry';

type Context = {
  registry: FactRegistry;
  source: FactSource;
  factsRead: FactRead[];
};

/** `pointer` is the node's own pointer, which `not` needs to name the child that was true. */
type NodeResult = { value: boolean; failedAt: string | null; pointer: string };

function isVarNode(operand: Operand): operand is { var: string } {
  return typeof operand === 'object' && operand !== null && !Array.isArray(operand);
}

function describeValue(value: Json): string {
  if (Array.isArray(value)) return 'a list';
  if (value === null) return 'null';
  return `a ${typeof value}`;
}

/**
 * The only place a fact is read. Checking the registry *before* touching the source is
 * what makes an unregistered path an error rather than whatever the source happens to
 * do with it, and parsing through the registered type is what keeps `factsRead` honest.
 */
function readOperand(operand: Operand, pointer: string, context: Context): Json {
  if (!isVarNode(operand)) {
    return operand as Json;
  }

  const path = operand.var;
  const definition = context.registry.get(path);
  if (definition === undefined) {
    throw new UnknownFactError(path, pointer);
  }

  const parsed = definition.type.safeParse(context.source.read(path));
  if (!parsed.success) {
    throw new FactTypeError(path, pointer, parsed.error.issues);
  }

  const value = parsed.data as Json;
  context.factsRead.push({ path, value });
  return value;
}

function strictEquals(operator: string, left: Json, right: Json, pointer: string): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    throw new ConditionTypeError(
      {
        kind: 'not-comparable',
        operator,
        operand: describeValue(Array.isArray(left) ? left : right),
      },
      pointer,
    );
  }
  return left === right;
}

function order(operator: string, left: Json, right: Json, pointer: string): boolean {
  if (typeof left !== 'number' || typeof right !== 'number') {
    throw new ConditionTypeError(
      {
        kind: 'not-orderable',
        operator,
        operand: describeValue(typeof left === 'number' ? right : left),
      },
      pointer,
    );
  }
  switch (operator) {
    case '<':
      return left < right;
    case '<=':
      return left <= right;
    case '>':
      return left > right;
    default:
      return left >= right;
  }
}

function membership(needle: Json, haystack: Json, pointer: string): boolean {
  if (!Array.isArray(haystack)) {
    throw new ConditionTypeError({ kind: 'not-a-set', operand: describeValue(haystack) }, pointer);
  }
  if (Array.isArray(needle)) {
    throw new ConditionTypeError(
      { kind: 'not-comparable', operator: 'in', operand: 'a list' },
      pointer,
    );
  }
  return haystack.some((candidate) => candidate === needle);
}

function evaluateNode(condition: Condition, container: string, context: Context): NodeResult {
  if ('all' in condition) {
    const pointer = childPointer(container, 'all');
    for (const [index, child] of condition.all.entries()) {
      const result = evaluateNode(child, childPointer(pointer, index), context);
      if (!result.value) {
        // Reports the child, so nesting resolves to the leaf that actually failed.
        return { value: false, failedAt: result.failedAt ?? result.pointer, pointer };
      }
    }
    return { value: true, failedAt: null, pointer };
  }

  if ('any' in condition) {
    const pointer = childPointer(container, 'any');
    for (const [index, child] of condition.any.entries()) {
      if (evaluateNode(child, childPointer(pointer, index), context).value) {
        return { value: true, failedAt: null, pointer };
      }
    }
    // No single child is to blame, so `any` reports itself.
    return { value: false, failedAt: pointer, pointer };
  }

  if ('not' in condition) {
    const pointer = childPointer(container, 'not');
    const child = evaluateNode(condition.not, pointer, context);
    return child.value
      ? { value: false, failedAt: child.pointer, pointer }
      : { value: true, failedAt: null, pointer };
  }

  // Whatever is left is a comparison: `Condition` is a closed union of single-key objects.
  const [operator, operands] = Object.entries(condition)[0] as [string, [Operand, Operand]];
  const pointer = childPointer(container, operator);
  const left = readOperand(operands[0], childPointer(pointer, 0), context);
  const right = readOperand(operands[1], childPointer(pointer, 1), context);

  const value =
    operator === 'in'
      ? membership(left, right, pointer)
      : operator === '=='
        ? strictEquals(operator, left, right, pointer)
        : operator === '!='
          ? !strictEquals(operator, left, right, pointer)
          : order(operator, left, right, pointer);

  return { value, failedAt: value ? null : pointer, pointer };
}

/**
 * Evaluates a condition in one pass (ADR-0013), returning the verdict, the facts read in
 * read order with their values (FR-14), and a JSON pointer to the sub-expression that
 * failed (`null` when it passed).
 *
 * Short-circuiting is part of the contract, not an implementation detail: `factsRead`
 * holds only the `var` nodes actually visited, which is what a static scan of the tree
 * could never give. `lintCondition` is the static counterpart, for content that has to be
 * checked before any values exist.
 */
export function evaluateCondition(
  condition: Condition,
  registry: FactRegistry,
  source: FactSource,
): ConditionResult {
  const context: Context = { registry, source, factsRead: [] };
  const result = evaluateNode(condition, ROOT_POINTER, context);
  return { value: result.value, factsRead: context.factsRead, failedAt: result.failedAt };
}
