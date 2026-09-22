import { makeRollId } from '../dice';
import type { Json, RollTargetKind } from '../schema';
import { RollTargetKind as RollTargetKindSchema } from '../schema';
import { TemplateRenderError } from './errors';
import type { ResolvedParams } from './params';

/**
 * The skeleton's two placeholder forms (ADR-0026).
 *
 * `{{name}}` is a param. A string that is *exactly* one placeholder is replaced by the param's
 * **value**, so a `conditionList` yields an array and a `boolean` yields a boolean; YAML has no
 * way to write a non-string hole, and a template that wanted `"[]"` where the schema wants `[]`
 * would fail `Situation.parse` for a reason nobody could act on. A placeholder embedded in a
 * longer string interpolates instead, and only a scalar may be interpolated — splicing an array
 * into a sentence has no meaning worth guessing at.
 *
 * `{{$rollId(<stepId>, <kind>)}}` is a roll id, which is derivable before evaluation precisely
 * so a template can pre-declare a choice (ADR-0011). It is minted through `makeRollId`, so the
 * format has one definition and a template cannot drift from the trace.
 */
const PLACEHOLDER = /\{\{([^{}]+)\}\}/g;
const ROLL_ID_CALL = /^\$rollId\(\s*([^,\s)]+)\s*,\s*([^,\s)]+)\s*\)$/;

/** What a skeleton step contributes to a roll id: who is acting on it. */
export type StepActors = ReadonlyMap<string, string>;

function resolveOne(
  expression: string,
  params: ResolvedParams,
  stepActors: StepActors,
  path: string,
): Json {
  const call = ROLL_ID_CALL.exec(expression);
  if (call !== null) {
    const stepId = call[1] ?? '';
    const kind = call[2] ?? '';
    const actorId = stepActors.get(stepId);
    if (actorId === undefined) {
      throw new TemplateRenderError(
        'unknown-placeholder',
        path,
        `$rollId names step '${stepId}', which the skeleton's timeline does not declare`,
      );
    }
    const parsed = RollTargetKindSchema.safeParse(kind);
    if (!parsed.success) {
      throw new TemplateRenderError(
        'unknown-placeholder',
        path,
        `'${kind}' is not a roll target kind (${RollTargetKindSchema.options.join(', ')})`,
      );
    }
    return makeRollId(stepId, { kind: parsed.data as RollTargetKind, actorId });
  }

  if (expression.startsWith('$')) {
    throw new TemplateRenderError(
      'unknown-placeholder',
      path,
      `'${expression}' is not a skeleton function; the only one is $rollId(<stepId>, <kind>)`,
    );
  }

  const value = params[expression];
  if (value === undefined) {
    throw new TemplateRenderError(
      'unknown-placeholder',
      path,
      `'${expression}' names no param this template declares`,
    );
  }
  return value;
}

function substituteString(
  value: string,
  params: ResolvedParams,
  stepActors: StepActors,
  path: string,
): Json {
  PLACEHOLDER.lastIndex = 0;
  const whole = /^\{\{([^{}]+)\}\}$/.exec(value);
  if (whole !== null) return resolveOne((whole[1] ?? '').trim(), params, stepActors, path);

  if (!value.includes('{{')) return value;

  return value.replace(PLACEHOLDER, (_match, expression: string) => {
    const resolved = resolveOne(expression.trim(), params, stepActors, path);
    if (typeof resolved === 'object' && resolved !== null) {
      throw new TemplateRenderError(
        'param-type',
        path,
        `'${expression.trim()}' is a list or object and cannot be interpolated into a string; ` +
          'use it as the whole value instead',
      );
    }
    return String(resolved);
  });
}

/**
 * Walk the skeleton and replace every placeholder, in keys as well as in values — a
 * `rollChoices` entry is keyed by a roll id, which is exactly a `{{$rollId(...)}}`.
 */
export function substitute(
  node: Json,
  params: ResolvedParams,
  stepActors: StepActors,
  path: string,
): Json {
  if (typeof node === 'string') return substituteString(node, params, stepActors, path);
  if (Array.isArray(node)) {
    return node.map((entry, index) => substitute(entry, params, stepActors, `${path}[${index}]`));
  }
  if (typeof node === 'object' && node !== null) {
    const result: { [key: string]: Json } = {};
    for (const [key, value] of Object.entries(node)) {
      const renderedKey = substituteString(key, params, stepActors, `${path}.${key}`);
      if (typeof renderedKey !== 'string') {
        throw new TemplateRenderError(
          'param-type',
          `${path}.${key}`,
          'an object key must render to a string',
        );
      }
      result[renderedKey] = substitute(value, params, stepActors, `${path}.${key}`);
    }
    return result;
  }
  return node;
}
