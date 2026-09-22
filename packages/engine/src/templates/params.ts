import type { Json, Template, TemplateParam } from '../schema';
import { TemplateRenderError } from './errors';

/**
 * A param's value, after defaults are filled in and the supplied values are type-checked.
 *
 * Every param carries a `default` (`schema/template.ts`), which is what makes "every template
 * renders with its defaults" a check rather than a wish: `resolveParams(template, undefined)`
 * is always a complete set. A caller supplying a subset gets the defaults for the rest, which
 * is how the form in `/scenarios/new` will behave when a field is untouched (FR-19).
 */
export type ResolvedParams = Record<string, Json>;

function typeError(name: string, param: TemplateParam, value: unknown): TemplateRenderError {
  return new TemplateRenderError(
    'param-type',
    `params.${name}`,
    `expected a ${param.type} value, got ${JSON.stringify(value) ?? typeof value}`,
  );
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

/**
 * The closed param vocabulary, checked one value at a time. It is deliberately not a Zod
 * union built per template: the constraints are per-param (`min`/`max`, `values`), and the
 * error an author needs names the param, not an index into a generated schema.
 */
function checkValue(name: string, param: TemplateParam, value: unknown): Json {
  switch (param.type) {
    case 'fixture':
      if (typeof value !== 'string' || value.length === 0) throw typeError(name, param, value);
      return value;

    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) throw typeError(name, param, value);
      if (param.min !== undefined && value < param.min) {
        throw new TemplateRenderError(
          'param-type',
          `params.${name}`,
          `${value} is below the declared minimum ${param.min}`,
        );
      }
      if (param.max !== undefined && value > param.max) {
        throw new TemplateRenderError(
          'param-type',
          `params.${name}`,
          `${value} is above the declared maximum ${param.max}`,
        );
      }
      return value;
    }

    case 'boolean':
      if (typeof value !== 'boolean') throw typeError(name, param, value);
      return value;

    case 'enum':
      if (typeof value !== 'string' || !param.values.includes(value)) {
        throw new TemplateRenderError(
          'param-type',
          `params.${name}`,
          `expected one of ${param.values.join(', ')}, got ${JSON.stringify(value)}`,
        );
      }
      return value;

    case 'conditionList':
      if (!isStringList(value)) throw typeError(name, param, value);
      return value;

    case 'rollChoice':
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
        throw typeError(name, param, value);
      }
      return value;
  }
}

/**
 * Fill in defaults and type-check what was supplied. A param nobody declared is an error
 * rather than an ignored key: silently dropping it would let a scenario be saved with params
 * that do not describe the situation it holds, which is what `scenarios.params` is for.
 */
export function resolveParams(template: Template, supplied: unknown): ResolvedParams {
  if (supplied !== undefined && (typeof supplied !== 'object' || supplied === null)) {
    throw new TemplateRenderError('param-type', 'params', 'params must be an object');
  }

  const given = (supplied ?? {}) as Record<string, unknown>;

  for (const name of Object.keys(given)) {
    if (template.params[name] === undefined) {
      throw new TemplateRenderError(
        'param-type',
        `params.${name}`,
        `template '${template.id}' declares no param '${name}'`,
      );
    }
  }

  const resolved: ResolvedParams = {};
  for (const [name, param] of Object.entries(template.params)) {
    resolved[name] = name in given ? checkValue(name, param, given[name]) : param.default;
  }
  return resolved;
}
