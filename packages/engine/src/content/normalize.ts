/**
 * Authored YAML shape → canonical schema shape.
 *
 * `docs/content-authoring.md` is written for a human holding an SRD, so it spells several
 * things shorter than the schema does: `value: { dice: 1d4 }` for a `DiceExpr`, a bare
 * `dieSelector: intent` for a tagged union, `anchor: source` for an `AnchorRef`, and it
 * omits fields a rule always has but rarely varies (`label`, `tags`). This module is the
 * one place those two spellings meet — the promise made in `schema/index.ts`.
 *
 * It is pure and knows nothing about YAML or files: it takes documents someone else has
 * already parsed into plain JSON and returns a `RulesetVersion` that has been through
 * `RulesetVersion.parse`. Reading them off a disk is `cli.ts`'s job, because `src/` may not
 * touch `fs` (ADR-0002, ADR-0020).
 *
 * Widening the authored vocabulary is a documentation change first: anything accepted here
 * and not written down in `content-authoring.md` is a shape only this file knows about.
 */

import { parseDiceNotation } from '../dice';
import type { FactDefinition, Fixture, PackManifest, RuleEntry, Template } from '../schema';
import {
  FactDefinition as FactDefinitionSchema,
  Fixture as FixtureSchema,
  PackManifest as PackManifestSchema,
  RuleEntry as RuleEntrySchema,
  RulesetVersion,
  Template as TemplateSchema,
} from '../schema';
import { ContentNormalizeError } from './errors';

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireObject(value: unknown, path: string): JsonObject {
  if (!isObject(value)) {
    throw new ContentNormalizeError('not-an-object', path, 'expected a mapping');
  }
  return value;
}

function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ContentNormalizeError('not-an-array', path, 'expected a sequence');
  }
  return value;
}

/**
 * `1d4` → `{ count: 1, sides: 4 }`.
 *
 * A `+M` in the notation is refused rather than dropped or folded in: a flat bonus baked
 * into a dice string would reach the roll without passing through the `addModifier`
 * channel, so its stacking policy could never apply (FR-11, ADR-0011). The author has to
 * write it as its own modifier, which is also the only form the trace can explain.
 */
function diceExprFrom(notation: string, path: string): JsonObject {
  const parsed = parseDiceNotation(notation);
  if (parsed.modifier !== 0) {
    throw new ContentNormalizeError(
      'dice-modifier',
      path,
      `'${notation}' carries a flat ${parsed.modifier > 0 ? '+' : ''}${parsed.modifier}; ` +
        'write it as its own addModifier effect so a stacking policy can apply to it (FR-11)',
    );
  }
  return { count: parsed.count, sides: parsed.sides };
}

/** `{ dice: 1d4 }` → `{ count, sides }`. A number, or an already-canonical expr, passes through. */
function normalizeModifierValue(value: unknown, path: string): unknown {
  if (!isObject(value) || !('dice' in value)) return value;

  const notation = value.dice;
  if (typeof notation !== 'string') {
    throw new ContentNormalizeError(
      'unknown-shorthand',
      `${path}.dice`,
      'expected dice notation as a string, e.g. 1d4',
    );
  }
  return diceExprFrom(notation, `${path}.dice`);
}

/** `1d8` → `{ count, sides }`, for the places the schema wants a bare `DiceExpr`. */
function normalizeDiceExpr(value: unknown, path: string): unknown {
  return typeof value === 'string' ? diceExprFrom(value, path) : value;
}

/** `intent` → `{ kind: 'intent' }`; `{ fixed: 2 }` → `{ kind: 'fixed', index: 2 }`. */
function normalizeDieSelector(value: unknown, path: string): unknown {
  if (value === 'intent') return { kind: 'intent' };
  if (isObject(value) && !('kind' in value) && 'fixed' in value) {
    return { kind: 'fixed', index: value.fixed };
  }
  if (typeof value === 'string') {
    throw new ContentNormalizeError(
      'unknown-shorthand',
      path,
      `'${value}' is not a die selector: write 'intent' or { fixed: <index> }`,
    );
  }
  return value;
}

/** `source` / `target` / an actor id → the tagged `AnchorRef` the schema carries. */
function normalizeAnchor(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  if (value === 'source' || value === 'target') return { kind: value };
  return { kind: 'actor', actorId: value };
}

function normalizeDuration(value: unknown): unknown {
  if (!isObject(value) || !('anchor' in value)) return value;
  return { ...value, anchor: normalizeAnchor(value.anchor) };
}

function normalizeEffect(raw: unknown, path: string): JsonObject {
  const effect = requireObject(raw, path);

  switch (effect.type) {
    case 'addModifier':
      return { ...effect, value: normalizeModifierValue(effect.value, `${path}.value`) };
    case 'rollTransform':
      return {
        ...effect,
        dieSelector: normalizeDieSelector(effect.dieSelector, `${path}.dieSelector`),
      };
    case 'rollDice':
      return { ...effect, expr: normalizeDiceExpr(effect.expr, `${path}.expr`) };
    case 'applyCondition':
      return { ...effect, duration: normalizeDuration(effect.duration) };
    default:
      return effect;
  }
}

/**
 * Defaults for the fields every `Rule` has and most rules do not vary. `label` falls back to
 * the key because that is what a renamed rule's label started as (`content-authoring.md`:
 * "renames keep the key and change `label`"), and `condition: null` means "always applies
 * once selected", which is what omitting it reads as.
 */
function normalizeRuleBody(raw: JsonObject, path: string): JsonObject {
  const key = raw.key;
  if (typeof key !== 'string' || key.length === 0) {
    throw new ContentNormalizeError('missing-field', `${path}.key`, 'every rule needs a key');
  }

  const effects = raw.effects === undefined ? [] : requireArray(raw.effects, `${path}.effects`);

  return {
    priority: 0,
    label: key,
    tags: [],
    condition: null,
    interpretation: null,
    ...raw,
    effects: effects.map((effect, index) => normalizeEffect(effect, `${path}.effects[${index}]`)),
  };
}

/** A `patch` carries only whitelisted fields and a `disable` carries none, so neither has a body. */
function normalizeRuleEntry(raw: unknown, path: string): JsonObject {
  const entry = requireObject(raw, path);
  const op = entry.op ?? 'add';

  if (op === 'patch') return { ...entry, op };
  if (op === 'disable') return { reason: null, ...entry, op };

  return { ...normalizeRuleBody(entry, path), op };
}

/** `derived` is the only `FactDefinition` field an author can reasonably leave implicit. */
function normalizeFact(raw: unknown, path: string): JsonObject {
  return { derived: false, ...requireObject(raw, path) };
}

/**
 * `facts.yaml` is a sequence of fact definitions. A mapping with a `facts:` key is accepted
 * too, because that is what a reader who has just seen `pack.yaml` tends to write.
 */
function normalizeFacts(raw: unknown): unknown[] {
  const list = isObject(raw) && 'facts' in raw ? raw.facts : raw;
  return requireArray(list, 'facts').map((fact, index) => normalizeFact(fact, `facts[${index}]`));
}

export type AuthoredPack = {
  /** `pack.yaml` — the ruleset identity, licence and attribution. */
  pack: unknown;
  /** `facts.yaml` — every path a condition in this pack may read. */
  facts: unknown;
  /** One parsed document per `rules/*.yaml`, in a deterministic order. */
  rules: readonly unknown[];
};

/**
 * One authored document at a time.
 *
 * `normalizePack` below assembles three files and then parses, which is right for the
 * loader but wrong for `content:lint` (FR-17): a Zod error then points at `rules[3]`, an
 * index into an object nobody can open. These take the `path` the document came from —
 * a filename, for the loader — and put it in front of every message, so a report names a
 * place an author can go and edit.
 */
export function normalizePackManifest(doc: unknown, path = 'pack'): PackManifest {
  return PackManifestSchema.parse({ extends: null, ...requireObject(doc, path) });
}

export function normalizeFactsFile(doc: unknown, path = 'facts'): FactDefinition[] {
  const list = isObject(doc) && 'facts' in doc ? doc.facts : doc;
  return requireArray(list, path).map((fact, index) =>
    FactDefinitionSchema.parse(normalizeFact(fact, `${path}[${index}]`)),
  );
}

export function normalizeRuleFile(doc: unknown, path: string): RuleEntry {
  return RuleEntrySchema.parse(normalizeRuleEntry(doc, path));
}

/**
 * A fixture's `damage.dice` is authored as notation for the same reason a modifier's value
 * is, and refused for the same reason if it carries a flat bonus (FR-11). The three
 * defaults are the fields most items simply do not have.
 */
export function normalizeFixture(doc: unknown, path: string): Fixture {
  const fixture = requireObject(doc, path);
  if (fixture.kind !== 'item') return FixtureSchema.parse(fixture);

  const data = requireObject(fixture.data ?? {}, `${path}.data`);
  const damage = isObject(data.damage)
    ? { ...data.damage, dice: normalizeDiceExpr(data.damage.dice, `${path}.data.damage.dice`) }
    : (data.damage ?? null);

  return FixtureSchema.parse({
    ...fixture,
    data: { properties: [], mastery: null, ...data, damage },
  });
}

/** `tags` is the only field a template has and rarely varies. */
export function normalizeTemplate(doc: unknown, path: string): Template {
  return TemplateSchema.parse({ tags: [], ...requireObject(doc, path) });
}

/**
 * Assemble the three authored documents into one `RulesetVersion` and validate it.
 *
 * The split exists because `pack.yaml` holds identity while `rules` and `facts` are lists
 * that grow — but the schema is one object, so something has to join them, and it is here
 * rather than in the loader so the join is testable without a filesystem.
 */
export function normalizePack(raw: AuthoredPack): RulesetVersion {
  const pack = requireObject(raw.pack, 'pack');

  return RulesetVersion.parse({
    extends: null,
    ...pack,
    facts: normalizeFacts(raw.facts),
    rules: raw.rules.map((rule, index) => normalizeRuleEntry(rule, `rules[${index}]`)),
  });
}
