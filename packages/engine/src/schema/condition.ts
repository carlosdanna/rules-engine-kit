import { z } from 'zod';
import { Json } from './json';

/**
 * Conditions are JSON Logic *syntax* evaluated by our own one-pass evaluator (ADR-0013),
 * so the supported operator set is closed: anything outside it fails `content:lint`
 * (FR-17) at load time rather than evaluating to `null` at run time.
 *
 * Comparisons are strict — no type coercion — and `all` short-circuits on its first false
 * child, which is the node the trace reports as `failedAt`.
 */
export const CONDITION_OPERATORS = [
  'var',
  'all',
  'any',
  'not',
  '==',
  '!=',
  '<',
  '<=',
  '>',
  '>=',
  'in',
] as const;

export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

/** Reads a path registered in the pack's `facts.yaml`. An unregistered path is an error. */
export const VarNode = z.strictObject({ var: z.string().min(1) });
export type VarNode = z.infer<typeof VarNode>;

const Primitive = z.union([z.string(), z.number(), z.boolean(), z.null()]);

/**
 * Deliberately narrower than "any JSON": an operand is a fact read, a primitive literal,
 * or a literal set for `in`. Nested objects have no meaning under the strict comparisons.
 */
export const Operand = z.union([VarNode, Primitive, z.array(Primitive)]);
export type Operand = z.infer<typeof Operand>;

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { '==': [Operand, Operand] }
  | { '!=': [Operand, Operand] }
  | { '<': [Operand, Operand] }
  | { '<=': [Operand, Operand] }
  | { '>': [Operand, Operand] }
  | { '>=': [Operand, Operand] }
  | { in: [Operand, Operand] };

const comparison = () => z.tuple([Operand, Operand]);

export const Condition: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.strictObject({ all: z.array(Condition).min(1) }),
    z.strictObject({ any: z.array(Condition).min(1) }),
    z.strictObject({ not: Condition }),
    z.strictObject({ '==': comparison() }),
    z.strictObject({ '!=': comparison() }),
    z.strictObject({ '<': comparison() }),
    z.strictObject({ '<=': comparison() }),
    z.strictObject({ '>': comparison() }),
    z.strictObject({ '>=': comparison() }),
    z.strictObject({ in: comparison() }),
  ]),
);

/** A fact path read while evaluating a condition, with the value it returned (FR-14). */
export const FactRead = z.strictObject({
  path: z.string().min(1),
  value: Json,
});
export type FactRead = z.infer<typeof FactRead>;

/**
 * What `evaluateCondition` returns: the verdict, the facts read in read order, and a JSON
 * pointer to the sub-expression that failed (`null` when the condition passed).
 */
export const ConditionResult = z.strictObject({
  value: z.boolean(),
  factsRead: z.array(FactRead),
  failedAt: z.string().nullable(),
});
export type ConditionResult = z.infer<typeof ConditionResult>;
