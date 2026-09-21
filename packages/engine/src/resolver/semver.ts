/**
 * The semver subset the resolver needs to check a layer's compatible range (VR-3).
 *
 * This is deliberately not the `semver` package: the engine ships to the browser and
 * stays dependency-light (zod only), and a layer range in `content/` is a caret, a tilde,
 * a comparator pair or an `||` of those. Anything outside the supported grammar is
 * rejected loudly rather than treated as "matches", so an unreadable range can never
 * quietly let an incompatible stack resolve.
 *
 * Supported: `*` / `x`, `1`, `1.2`, `1.2.3`, `1.2.x`, `^…`, `~…`, `>= > <= < =` with a
 * complete version, several comparators joined by spaces (AND), alternatives joined by
 * `||` (OR). Not supported: hyphen ranges (`1.2.3 - 2.3.4`) and partial versions after an
 * explicit comparator (`>=1.2`).
 */

export type SemverParts = {
  major: number;
  minor: number;
  patch: number;
  /** Dot-separated identifiers, numeric ones as numbers. Empty for a release. */
  prerelease: readonly (string | number)[];
};

const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

const NUMERIC_IDENTIFIER = /^(?:0|[1-9]\d*)$/;

/** `null` rather than a throw, so callers can decide whether a bad version is fatal. */
export function parseSemver(version: string): SemverParts | null {
  const match = SEMVER.exec(version);
  if (match === null) return null;

  const [, major, minor, patch, prerelease] = match;
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    prerelease:
      prerelease === undefined
        ? []
        : prerelease.split('.').map((id) => (NUMERIC_IDENTIFIER.test(id) ? Number(id) : id)),
  };
}

function requireSemver(version: string): SemverParts {
  const parsed = parseSemver(version);
  if (parsed === null) {
    throw new TypeError(`not a semver version: ${JSON.stringify(version)}`);
  }
  return parsed;
}

function compareIdentifiers(a: string | number, b: string | number): number {
  const aNumeric = typeof a === 'number';
  const bNumeric = typeof b === 'number';
  // A numeric identifier always has lower precedence than an alphanumeric one.
  if (aNumeric && !bNumeric) return -1;
  if (!aNumeric && bNumeric) return 1;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function comparePrerelease(a: SemverParts, b: SemverParts): number {
  // A release outranks any prerelease of the same version.
  if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0;
  if (a.prerelease.length === 0) return 1;
  if (b.prerelease.length === 0) return -1;

  const shared = Math.min(a.prerelease.length, b.prerelease.length);
  for (let i = 0; i < shared; i++) {
    const left = a.prerelease[i];
    const right = b.prerelease[i];
    if (left === undefined || right === undefined) break;
    const order = compareIdentifiers(left, right);
    if (order !== 0) return order;
  }
  return a.prerelease.length - b.prerelease.length;
}

function compareParts(a: SemverParts, b: SemverParts): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch || comparePrerelease(a, b);
}

/** Negative, zero or positive, as a sort comparator. Throws on an unparsable version. */
export function compareSemver(a: string, b: string): number {
  return compareParts(requireSemver(a), requireSemver(b));
}

type ComparatorOp = '<' | '<=' | '>' | '>=' | '=';

type Comparator = { op: ComparatorOp; version: SemverParts };

const EXPLICIT_OPS: readonly ComparatorOp[] = ['>=', '<=', '>', '<', '='];

const PARTIAL =
  /^(0|[1-9]\d*|[xX*])(?:\.(0|[1-9]\d*|[xX*])(?:\.(0|[1-9]\d*|[xX*])(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?)?)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/** `null` for a wildcard or an absent position. */
type PartialVersion = {
  major: number | null;
  minor: number | null;
  patch: number | null;
  prerelease: readonly (string | number)[];
};

function parsePartial(text: string): PartialVersion | null {
  const match = PARTIAL.exec(text);
  if (match === null) return null;

  const [, major, minor, patch, prerelease] = match;
  const part = (value: string | undefined): number | null =>
    value === undefined || value === 'x' || value === 'X' || value === '*' ? null : Number(value);

  return {
    major: part(major),
    minor: part(minor),
    patch: part(patch),
    prerelease:
      prerelease === undefined
        ? []
        : prerelease.split('.').map((id) => (NUMERIC_IDENTIFIER.test(id) ? Number(id) : id)),
  };
}

function atLeast(partial: PartialVersion): Comparator {
  return {
    op: '>=',
    version: {
      major: partial.major ?? 0,
      minor: partial.minor ?? 0,
      patch: partial.patch ?? 0,
      prerelease: partial.prerelease,
    },
  };
}

function below(major: number, minor: number, patch: number): Comparator {
  return { op: '<', version: { major, minor, patch, prerelease: [] } };
}

/** `^1.2.3` → `>=1.2.3 <2.0.0`; below 1.0.0 the caret narrows to the leftmost non-zero. */
function expandCaret(partial: PartialVersion): Comparator[] {
  const major = partial.major ?? 0;
  if (major !== 0) return [atLeast(partial), below(major + 1, 0, 0)];
  if (partial.minor === null) return [atLeast(partial), below(1, 0, 0)];
  if (partial.minor !== 0) return [atLeast(partial), below(0, partial.minor + 1, 0)];
  if (partial.patch === null) return [atLeast(partial), below(0, 1, 0)];
  return [atLeast(partial), below(0, 0, partial.patch + 1)];
}

/** `~1.2.3` → `>=1.2.3 <1.3.0`; `~1` → `>=1.0.0 <2.0.0`. */
function expandTilde(partial: PartialVersion): Comparator[] {
  const major = partial.major ?? 0;
  if (partial.minor === null) return [atLeast(partial), below(major + 1, 0, 0)];
  return [atLeast(partial), below(major, partial.minor + 1, 0)];
}

/** A bare `1.2.x` is the range it spells out; a bare `1.2.3` is an equality. */
function expandBare(partial: PartialVersion): Comparator[] {
  if (partial.major === null) return [atLeast(partial)];
  if (partial.minor === null) return [atLeast(partial), below(partial.major + 1, 0, 0)];
  if (partial.patch === null) return [atLeast(partial), below(partial.major, partial.minor + 1, 0)];
  return [
    {
      op: '=',
      version: {
        major: partial.major,
        minor: partial.minor,
        patch: partial.patch,
        prerelease: partial.prerelease,
      },
    },
  ];
}

function expandToken(token: string): Comparator[] | null {
  if (token.startsWith('^') || token.startsWith('~')) {
    const partial = parsePartial(token.slice(1));
    if (partial === null) return null;
    return token.startsWith('^') ? expandCaret(partial) : expandTilde(partial);
  }

  const op = EXPLICIT_OPS.find((candidate) => token.startsWith(candidate));
  if (op !== undefined) {
    // An explicit comparator needs a complete version: `>=1.2` reads as either
    // `>=1.2.0` or `>=1.3.0` depending on who you ask, so we refuse it instead.
    const version = parseSemver(token.slice(op.length));
    if (version === null) return null;
    return [{ op, version }];
  }

  const partial = parsePartial(token);
  return partial === null ? null : expandBare(partial);
}

const BARE_OP = new Set<string>(EXPLICIT_OPS);

function parseComparatorSet(text: string): Comparator[] | null {
  const tokens = text.split(/\s+/).filter((token) => token.length > 0);
  if (tokens.length === 0) return null;

  // `>= 5.1.0` is written with a space often enough to be worth joining back up.
  const joined: string[] = [];
  for (const token of tokens) {
    const previous = joined.at(-1);
    if (previous !== undefined && BARE_OP.has(previous))
      joined[joined.length - 1] = previous + token;
    else joined.push(token);
  }

  const comparators: Comparator[] = [];
  for (const token of joined) {
    const expanded = expandToken(token);
    if (expanded === null) return null;
    comparators.push(...expanded);
  }
  return comparators;
}

function satisfiesComparator(version: SemverParts, comparator: Comparator): boolean {
  const order = compareParts(version, comparator.version);
  switch (comparator.op) {
    case '<':
      return order < 0;
    case '<=':
      return order <= 0;
    case '>':
      return order > 0;
    case '>=':
      return order >= 0;
    case '=':
      return order === 0;
  }
}

function sameRelease(a: SemverParts, b: SemverParts): boolean {
  return a.major === b.major && a.minor === b.minor && a.patch === b.patch;
}

function satisfiesSet(version: SemverParts, comparators: readonly Comparator[]): boolean {
  if (version.prerelease.length > 0) {
    // A prerelease only satisfies a set that asked for a prerelease of that same
    // release, so `5.3.0-rc.1` does not slip into `^5.2.0`.
    const invited = comparators.some(
      (comparator) =>
        comparator.version.prerelease.length > 0 && sameRelease(version, comparator.version),
    );
    if (!invited) return false;
  }
  return comparators.every((comparator) => satisfiesComparator(version, comparator));
}

/**
 * Whether `version` is inside `range`. Throws a `TypeError` on a version or a range the
 * subset cannot read — the caller turns that into a typed resolution failure (VR-3).
 */
export function satisfiesRange(version: string, range: string): boolean {
  const parsed = requireSemver(version);

  const sets = range.split('||').map((alternative) => parseComparatorSet(alternative.trim()));
  if (sets.some((set) => set === null)) {
    throw new TypeError(`unsupported semver range: ${JSON.stringify(range)}`);
  }

  return sets.some((set) => set !== null && satisfiesSet(parsed, set));
}
