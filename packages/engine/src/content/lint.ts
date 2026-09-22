/**
 * `content:lint`, minus the filesystem (FR-17, NFR-6).
 *
 * The checks live here, in `src/`, and take documents someone else has already parsed;
 * `packages/db/src/content` walks a directory and supplies them with the filename
 * attached. That split is ADR-0020's: deciding what authored content *means* is engine
 * knowledge and should be testable without a disk, and only reading bytes is outside.
 *
 * Almost nothing here is new logic. `lintCondition` already walks a raw condition tree
 * reporting unregistered paths and operators outside the closed subset, and
 * `resolveProfile` already reports a second `add`, an `override` of a key nobody defined
 * and the rest as `Conflict`s — its own docstring says its input is "trusted to be
 * schema-valid: packs are parsed when they are loaded (`content:lint`, FR-17)". This
 * module is the caller that makes that sentence true.
 *
 * Two properties it owes an author, both tested:
 *
 * - **Every issue names a file.** A tree holds several packs, so a Zod error at
 *   `rules[3].effects[0]` is not something anyone can act on. The per-document entry
 *   points in `./normalize` exist for this.
 * - **One pass reports everything.** The checks collect rather than throw, so fixing six
 *   mistakes takes one run and not six.
 */

import { lintCondition, registryFromFacts } from '../conditions';
import { IncompatibleStackError, resolveProfile, satisfiesRange } from '../resolver';
import type { Conflict, FactDefinition, PackManifest, RuleEntry, RulesetVersion } from '../schema';
import { PATCHABLE_RULE_FIELDS } from '../schema';
import { ContentNormalizeError } from './errors';
import {
  normalizeFactsFile,
  normalizeFixture,
  normalizePackManifest,
  normalizeRuleFile,
  normalizeTemplate,
} from './normalize';

export type ContentIssueCode =
  /** The bytes were not YAML. Only a loader can raise this; it is here so the code set is one set. */
  | 'yaml-parse'
  | 'schema'
  | 'missing-license'
  | 'missing-attribution'
  | 'missing-citation'
  | 'unknown-fact'
  | 'unsupported-operator'
  | 'duplicate-fact'
  | 'duplicate-rule-key'
  | 'override-missing'
  | 'patch-missing'
  | 'patch-forbidden-field'
  | 'disable-missing'
  | 'priority-tie'
  | 'unresolvable-base';

export type ContentIssue = {
  /** A warning is something nobody chose; an error is something nobody meant. */
  severity: 'error' | 'warning';
  code: ContentIssueCode;
  /** Where the loader found the document. Never empty. */
  file: string;
  /** Dotted path or JSON pointer inside it; `''` when the whole file is the problem. */
  path: string;
  message: string;
};

export type ContentDoc = {
  file: string;
  /** Parsed YAML, not validated. Raw on purpose: an unsupported operator is only visible here. */
  doc: unknown;
};

/** One pack directory: `pack.yaml`, `facts.yaml` and `rules/*.yaml` in a deterministic order. */
export type AuthoredPackDocs = {
  dir: string;
  manifest: ContentDoc;
  facts: ContentDoc;
  rules: ContentDoc[];
};

export type ContentDocs = {
  packs: AuthoredPackDocs[];
  fixtures: ContentDoc[];
  templates: ContentDoc[];
};

/** Stands in for a field whose absence has already been reported under its own name. */
const UNSET = '(unset)';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Absent, not a string, or nothing but whitespace — all three are "missing" to a reader. */
function isBlank(value: unknown): boolean {
  return typeof value !== 'string' || value.trim().length === 0;
}

function issue(
  severity: ContentIssue['severity'],
  code: ContentIssueCode,
  file: string,
  path: string,
  message: string,
): ContentIssue {
  return { severity, code, file, path, message };
}

const error = (code: ContentIssueCode, file: string, path: string, message: string) =>
  issue('error', code, file, path, message);

/**
 * A `ZodError` becomes one issue per Zod issue, so a rule with three wrong fields reports
 * three lines rather than one wall. Anything else — a `ContentNormalizeError`, a
 * `DuplicateFactError` — carries its own message and the path it already knows.
 */
function schemaIssues(
  thrown: unknown,
  file: string,
  code: ContentIssueCode = 'schema',
): ContentIssue[] {
  if (thrown instanceof ContentNormalizeError) {
    // The normaliser prefixes its path with whatever it was given, which is the filename;
    // the report already prints that, so an issue at the top of a file shows no path
    // rather than the file's own name a second time.
    const within = thrown.path === file ? '' : thrown.path.replace(`${file}.`, '');
    return [error(code, file, within, thrown.message.replace(`${file}: `, ''))];
  }
  if (isObject(thrown) && Array.isArray((thrown as { issues?: unknown }).issues)) {
    const zod = thrown as { issues: { path: PropertyKey[]; message: string }[] };
    return zod.issues.map((detail) =>
      error(code, file, detail.path.map(String).join('.'), detail.message),
    );
  }
  return [error(code, file, '', thrown instanceof Error ? thrown.message : String(thrown))];
}

/** What survived parsing, so the later passes can work on schema-valid values. */
type ParsedPack = {
  docs: AuthoredPackDocs;
  manifest: PackManifest;
  facts: FactDefinition[];
  /** Filled by `parsePackRules`, after the conditions have been linted in their raw form. */
  rules: { file: string; entry: RuleEntry }[];
};

/**
 * `pack.yaml` and `facts.yaml` only.
 *
 * The rule files wait for a second pass because linting their conditions needs a fact
 * registry, a layer's registry includes its base's facts, and finding the base needs
 * every manifest in the tree parsed first.
 */
function parsePackHead(docs: AuthoredPackDocs, issues: ContentIssue[]): ParsedPack | null {
  const manifestFile = docs.manifest.file;
  const raw = docs.manifest.doc;

  // The loader already said why it could not read these, and "expected a mapping" on top
  // of "cannot read as YAML" is the same mistake reported twice.
  if (raw === undefined || docs.facts.doc === undefined) return null;

  // Named before the schema parse rather than after it: NFR-6 is a licensing promise this
  // repository makes in public, and "invalid_type at license" is not that sentence.
  if (isObject(raw)) {
    if (isBlank(raw.license)) {
      issues.push(
        error(
          'missing-license',
          manifestFile,
          'license',
          'every pack declares a licence; seeding fails without one (NFR-6)',
        ),
      );
    }
    if (isBlank(raw.attribution)) {
      issues.push(
        error(
          'missing-attribution',
          manifestFile,
          'attribution',
          'every pack carries the attribution its licence requires (NFR-6, CREDITS.md)',
        ),
      );
    }
  }

  // Both gaps are now reported, so they are filled with a placeholder before the parse:
  // a pack with no licence still has its rules linted. A missing licence is one thing to
  // fix, and it should not also hide the six mistakes in `rules/`. The placeholder reaches
  // nothing but this function's own resolution pass.
  const candidate = isObject(raw)
    ? {
        ...raw,
        ...(isBlank(raw.license) ? { license: UNSET } : {}),
        ...(isBlank(raw.attribution) ? { attribution: UNSET } : {}),
      }
    : raw;

  let manifest: PackManifest;
  try {
    manifest = normalizePackManifest(candidate, manifestFile);
  } catch (thrown) {
    issues.push(...schemaIssues(thrown, manifestFile));
    return null;
  }

  let facts: FactDefinition[];
  try {
    facts = normalizeFactsFile(docs.facts.doc, docs.facts.file);
  } catch (thrown) {
    issues.push(...schemaIssues(thrown, docs.facts.file));
    return null;
  }

  // `registryFromFacts` throws on a repeated path, which would otherwise surface as an
  // evaluation-time failure long after the file was written.
  try {
    registryFromFacts(facts);
  } catch (thrown) {
    issues.push(...schemaIssues(thrown, docs.facts.file, 'duplicate-fact'));
    return null;
  }

  return { docs, manifest, facts, rules: [] };
}

/**
 * The rule files, once their conditions have been reported on.
 *
 * A condition that fails the schema parse usually fails it *because* of what the condition
 * lint just said — an operator outside the closed subset is not a `Condition` — so the
 * generic schema issue for that field is dropped in favour of the specific one. Anything
 * else wrong with the rule is still reported.
 */
function parsePackRules(pack: ParsedPack, issues: ContentIssue[]): void {
  // A field this lint has already named in its own words does not also get a raw schema
  // error: `unsupported-operator` explains why the condition is not a `Condition`, and
  // `missing-citation` explains why `citation` is absent.
  const explained = new Map<string, Set<string>>();
  const explain = (file: string, field: string): void => {
    const fields = explained.get(file) ?? new Set<string>();
    fields.add(field);
    explained.set(file, fields);
  };
  for (const raised of issues) {
    if (raised.code === 'unknown-fact' || raised.code === 'unsupported-operator') {
      explain(raised.file, 'condition');
    }
  }

  const keep = (file: string) => (raised: ContentIssue) =>
    ![...(explained.get(file) ?? [])].some((field) => raised.path.startsWith(field));

  const patchable = new Set<string>([...PATCHABLE_RULE_FIELDS, 'op', 'key']);

  for (const ruleDoc of pack.docs.rules) {
    if (ruleDoc.doc === undefined) continue;

    // ADR-0009's whitelist, checked here rather than left to the schema. `RulePatch` is a
    // strict object, so a patch naming `phase` fails as "Unrecognized key" — true, but it
    // does not say the thing an author needs to hear, which is that changing what a rule
    // decides requires `override` (VR-2).
    if (isObject(ruleDoc.doc) && ruleDoc.doc.op === 'patch') {
      const forbidden = Object.keys(ruleDoc.doc).filter((field) => !patchable.has(field));
      if (forbidden.length > 0) {
        issues.push(
          error(
            'patch-forbidden-field',
            ruleDoc.file,
            forbidden[0] ?? '',
            `a patch may not change ${forbidden.join(', ')}: changing phase, condition or effects requires \`override\` (ADR-0009, VR-2)`,
          ),
        );
        continue;
      }
    }

    if (isObject(ruleDoc.doc) && ruleDoc.doc.op !== 'patch' && ruleDoc.doc.op !== 'disable') {
      const citation = ruleDoc.doc.citation;
      if (!isObject(citation) || isBlank(citation.source) || isBlank(citation.section)) {
        issues.push(
          error(
            'missing-citation',
            ruleDoc.file,
            'citation',
            'every rule cites the SRD section it paraphrases, by section path (FR-17, CONTRIBUTING.md)',
          ),
        );
        explain(ruleDoc.file, 'citation');
      }
    }

    try {
      pack.rules.push({ file: ruleDoc.file, entry: normalizeRuleFile(ruleDoc.doc, ruleDoc.file) });
    } catch (thrown) {
      issues.push(...schemaIssues(thrown, ruleDoc.file).filter(keep(ruleDoc.file)));
    }
  }
}

/**
 * The paths a pack's conditions may read: its own, plus its base's when it is a layer.
 *
 * First declaration wins, exactly as `cli.ts` merges them before evaluation — a layer
 * repeating a path its base already declared is normal and harmless, and a genuine
 * disagreement about a path's type is caught there rather than reported twice here.
 */
function registryFor(pack: ParsedPack, bases: ParsedPack[]): ReturnType<typeof registryFromFacts> {
  const merged = new Map<string, FactDefinition>();
  for (const fact of pack.facts) merged.set(fact.path, fact);

  if (pack.manifest.extends !== null) {
    for (const base of basesFor(pack, bases)) {
      for (const fact of base.facts) {
        if (!merged.has(fact.path)) merged.set(fact.path, fact);
      }
    }
  }
  return registryFromFacts([...merged.values()]);
}

/** Every base in the tree a layer could legitimately sit on top of (VR-3). */
function basesFor(pack: ParsedPack, bases: ParsedPack[]): ParsedPack[] {
  const declared = pack.manifest.extends;
  if (declared === null) return [];

  return bases.filter((base) => {
    if (base.manifest.id !== declared.id) return false;
    try {
      return satisfiesRange(base.manifest.version, declared.range);
    } catch {
      // An unreadable range is reported as `unresolvable-base` rather than silently
      // matching nothing, so a typo in a caret cannot look like a missing base.
      return false;
    }
  });
}

function lintConditions(pack: ParsedPack, bases: ParsedPack[], issues: ContentIssue[]): void {
  let registry: ReturnType<typeof registryFromFacts>;
  try {
    registry = registryFor(pack, bases);
  } catch {
    return; // Already reported as `duplicate-fact` on the pack that owns the clash.
  }

  // The raw documents, not the parsed rules: `lintCondition` takes `unknown` precisely so
  // it runs before the Zod parse, which is the only way an unsupported operator is visible
  // at all — to the schema it is simply not a `Condition`.
  for (const rule of pack.docs.rules) {
    if (rule.doc === undefined) continue;
    const condition = isObject(rule.doc) ? rule.doc.condition : undefined;
    if (condition === undefined || condition === null) continue;

    const result = lintCondition(condition, registry);
    for (const unknown of result.unknownPaths) {
      issues.push(error('unknown-fact', rule.file, unknown.pointer, unknown.message));
    }
    for (const unsupported of result.unsupportedOperators) {
      issues.push(
        error('unsupported-operator', rule.file, unsupported.pointer, unsupported.message),
      );
    }
  }
}

const CONFLICT_CODES: Record<Conflict['kind'], ContentIssueCode> = {
  'duplicate-add': 'duplicate-rule-key',
  'override-missing': 'override-missing',
  'patch-missing': 'patch-missing',
  'patch-forbidden-field': 'patch-forbidden-field',
  'disable-missing': 'disable-missing',
  'priority-tie': 'priority-tie',
};

function toRulesetVersion(pack: ParsedPack): RulesetVersion {
  return { ...pack.manifest, facts: pack.facts, rules: pack.rules.map((rule) => rule.entry) };
}

/**
 * Where to point a conflict. The resolver reports one against the layer that caused it and
 * the key it touched; the file is whichever rule file in that pack declared the key last,
 * which for a `duplicate-add` is the second of the two — the one an author would delete.
 */
function conflictFile(packs: ParsedPack[], conflict: Conflict): string {
  for (const pack of packs) {
    if (pack.manifest.id !== conflict.layer) continue;
    const declaring = pack.rules.filter((rule) => rule.entry.key === conflict.ruleKey);
    const last = declaring.at(-1);
    if (last !== undefined) return last.file;
  }
  return packs[0]?.docs.manifest.file ?? '';
}

/**
 * Hand every stack the tree can form to `resolveProfile` and surface what it reports.
 *
 * A base is linted on its own, which is what catches a duplicate `rule_key` inside one
 * pack; a layer is linted on each base it declares compatibility with, which is what
 * catches an `override` of a key the base does not have. A layer that matches no base is
 * an error on its own — it can never be resolved, so nothing would ever check it.
 */
function lintStacks(packs: ParsedPack[], issues: ContentIssue[]): void {
  const bases = packs.filter((pack) => pack.manifest.kind === 'base');
  const stacks: ParsedPack[][] = bases.map((base) => [base]);

  for (const pack of packs) {
    if (pack.manifest.kind !== 'layer') continue;
    const candidates = basesFor(pack, bases);
    if (candidates.length === 0) {
      const declared = pack.manifest.extends;
      issues.push(
        error(
          'unresolvable-base',
          pack.docs.manifest.file,
          'extends',
          `no base in this tree is ${declared?.id} "${declared?.range}", so nothing can resolve this layer (VR-3)`,
        ),
      );
      continue;
    }
    stacks.push(...candidates.map((base) => [base, pack]));
  }

  for (const stack of stacks) {
    let conflicts: Conflict[];
    try {
      conflicts = resolveProfile(stack.map(toRulesetVersion)).conflicts;
    } catch (thrown) {
      if (!(thrown instanceof IncompatibleStackError)) throw thrown;
      const last = stack.at(-1);
      issues.push(
        error('unresolvable-base', last?.docs.manifest.file ?? '', 'extends', thrown.message),
      );
      continue;
    }

    for (const conflict of conflicts) {
      const code = CONFLICT_CODES[conflict.kind];
      issues.push(
        issue(
          code === 'priority-tie' ? 'warning' : 'error',
          code,
          conflictFile(stack, conflict),
          conflict.ruleKey,
          conflict.detail,
        ),
      );
    }
  }
}

/**
 * A layer compatible with two bases is resolved twice, so a mistake in the layer itself
 * would be reported once per base. The author has one thing to fix, so they see one line.
 */
function dedupe(issues: readonly ContentIssue[]): ContentIssue[] {
  const seen = new Set<string>();
  return issues.filter((candidate) => {
    const key = [candidate.code, candidate.file, candidate.path, candidate.message].join('\u0000');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function lintContent(docs: ContentDocs): ContentIssue[] {
  const issues: ContentIssue[] = [];

  const packs = docs.packs
    .map((pack) => parsePackHead(pack, issues))
    .filter((pack): pack is ParsedPack => pack !== null);
  const bases = packs.filter((pack) => pack.manifest.kind === 'base');

  for (const pack of packs) lintConditions(pack, bases, issues);
  for (const pack of packs) parsePackRules(pack, issues);
  lintStacks(packs, issues);

  for (const fixture of docs.fixtures) {
    if (fixture.doc === undefined) continue;
    const citation = isObject(fixture.doc) ? fixture.doc.citation : undefined;
    const uncited =
      isObject(fixture.doc) &&
      (!isObject(citation) || isBlank(citation.source) || isBlank(citation.section));

    if (uncited) {
      issues.push(
        error(
          'missing-citation',
          fixture.file,
          'citation',
          'every fixture cites the SRD section its printed values come from (FR-17, CONTRIBUTING.md)',
        ),
      );
    }

    try {
      normalizeFixture(fixture.doc, fixture.file);
    } catch (thrown) {
      // As for a rule: the gap is already named, so it does not also arrive as Zod output.
      const raised = schemaIssues(thrown, fixture.file);
      issues.push(...(uncited ? raised.filter((i) => !i.path.startsWith('citation')) : raised));
    }
  }

  // Schema only. Rendering each template with its defaults and checking that every
  // suggested profile resolves its fixture slugs needs `renderTemplate`, which is
  // unwritten — Q24 in `docs/open-questions.md`.
  for (const template of docs.templates) {
    if (template.doc === undefined) continue;
    try {
      normalizeTemplate(template.doc, template.file);
    } catch (thrown) {
      issues.push(...schemaIssues(thrown, template.file));
    }
  }

  return dedupe(issues);
}
