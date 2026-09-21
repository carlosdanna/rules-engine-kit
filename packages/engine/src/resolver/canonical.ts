/**
 * Canonical JSON: the one spelling of a value that the profile hash is taken over
 * (ADR-0009). Object keys are sorted by UTF-16 code unit — not by locale, which would
 * make the hash depend on the machine — and arrays keep their order, because order is
 * part of what a resolved rule list means.
 *
 * Values JSON cannot carry are thrown on rather than dropped: `JSON.stringify` silently
 * omits an `undefined` property and turns `NaN` into `null`, and either would give two
 * different profiles the same hash.
 */

const PLAIN_OBJECT = Object.prototype;

function write(value: unknown, path: string): string {
  if (value === null) return 'null';

  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) {
        throw new TypeError(`${path}: ${value} is not a finite number, so it is not JSON`);
      }
      return JSON.stringify(value);
    case 'undefined':
      throw new TypeError(`${path}: undefined is not JSON`);
    case 'object': {
      if (Array.isArray(value)) {
        return `[${value.map((item, index) => write(item, `${path}[${index}]`)).join(',')}]`;
      }
      const prototype = Object.getPrototypeOf(value) as object | null;
      if (prototype !== PLAIN_OBJECT && prototype !== null) {
        throw new TypeError(
          `${path}: ${value.constructor?.name ?? 'this object'} is not a plain JSON object`,
        );
      }
      const record = value as Record<string, unknown>;
      const fields = Object.keys(record)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${write(record[key], `${path}.${key}`)}`);
      return `{${fields.join(',')}}`;
    }
    default:
      throw new TypeError(`${path}: a ${typeof value} is not JSON`);
  }
}

/** Deterministic JSON text for `value`, with every object's keys in sorted order. */
export function canonicalJson(value: unknown): string {
  return write(value, '$');
}
