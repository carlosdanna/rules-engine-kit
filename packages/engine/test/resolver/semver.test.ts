import { describe, expect, it } from 'vitest';
import { compareSemver, parseSemver, satisfiesRange } from '../../src/index';

describe('parseSemver', () => {
  it('parses major, minor and patch', () => {
    expect(parseSemver('5.2.1')).toEqual({ major: 5, minor: 2, patch: 1, prerelease: [] });
  });

  it('parses dotted prerelease identifiers, numeric ones as numbers', () => {
    expect(parseSemver('1.0.0-rc.2')).toEqual({
      major: 1,
      minor: 0,
      patch: 0,
      prerelease: ['rc', 2],
    });
  });

  it('ignores build metadata, which does not affect precedence', () => {
    expect(parseSemver('1.0.0+build.5')?.prerelease).toEqual([]);
    expect(compareSemver('1.0.0+a', '1.0.0+b')).toBe(0);
  });

  it('returns null for anything that is not a semver version', () => {
    expect(parseSemver('5.2')).toBeNull();
    expect(parseSemver('v5.2.1')).toBeNull();
    expect(parseSemver('05.2.1')).toBeNull();
    expect(parseSemver('')).toBeNull();
  });
});

describe('compareSemver', () => {
  it('orders by major, then minor, then patch', () => {
    expect(compareSemver('1.0.0', '2.0.0')).toBeLessThan(0);
    expect(compareSemver('1.2.0', '1.10.0')).toBeLessThan(0);
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0);
    expect(compareSemver('5.2.1', '5.1.0')).toBeGreaterThan(0);
  });

  it('puts a prerelease below its release', () => {
    expect(compareSemver('1.0.0-rc.1', '1.0.0')).toBeLessThan(0);
  });

  it('orders prerelease identifiers numerically, then by ASCII, shorter first', () => {
    expect(compareSemver('1.0.0-alpha', '1.0.0-alpha.1')).toBeLessThan(0);
    expect(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta')).toBeLessThan(0);
    expect(compareSemver('1.0.0-beta.2', '1.0.0-beta.11')).toBeLessThan(0);
    expect(compareSemver('1.0.0-rc.1', '1.0.0-beta.11')).toBeGreaterThan(0);
  });

  it('throws on a version it cannot parse, rather than sorting it arbitrarily', () => {
    expect(() => compareSemver('1.0', '1.0.0')).toThrow();
  });
});

describe('satisfiesRange', () => {
  it('matches an exact version', () => {
    expect(satisfiesRange('5.2.1', '5.2.1')).toBe(true);
    expect(satisfiesRange('5.2.1', '=5.2.1')).toBe(true);
    expect(satisfiesRange('5.2.0', '5.2.1')).toBe(false);
  });

  it('handles caret ranges, including the 0.x and 0.0.x narrowing', () => {
    expect(satisfiesRange('5.2.1', '^5.2.0')).toBe(true);
    expect(satisfiesRange('5.9.9', '^5.2.0')).toBe(true);
    expect(satisfiesRange('5.1.0', '^5.2.0')).toBe(false);
    expect(satisfiesRange('6.0.0', '^5.2.0')).toBe(false);
    expect(satisfiesRange('0.2.9', '^0.2.3')).toBe(true);
    expect(satisfiesRange('0.3.0', '^0.2.3')).toBe(false);
    expect(satisfiesRange('0.0.3', '^0.0.3')).toBe(true);
    expect(satisfiesRange('0.0.4', '^0.0.3')).toBe(false);
  });

  it('handles tilde ranges', () => {
    expect(satisfiesRange('5.2.9', '~5.2.1')).toBe(true);
    expect(satisfiesRange('5.3.0', '~5.2.1')).toBe(false);
    expect(satisfiesRange('5.2.0', '~5.2')).toBe(true);
    expect(satisfiesRange('5.9.0', '~5')).toBe(true);
    expect(satisfiesRange('6.0.0', '~5')).toBe(false);
  });

  it('handles comparators, and joins several with a space as AND', () => {
    expect(satisfiesRange('5.2.1', '>=5.1.0')).toBe(true);
    expect(satisfiesRange('5.2.1', '>5.2.1')).toBe(false);
    expect(satisfiesRange('5.2.1', '<=5.2.1')).toBe(true);
    expect(satisfiesRange('5.2.1', '>=5.1.0 <6.0.0')).toBe(true);
    expect(satisfiesRange('6.0.0', '>=5.1.0 <6.0.0')).toBe(false);
  });

  it('joins alternatives with ||', () => {
    // The house-rule layer in the demo has to sit on either SRD base.
    expect(satisfiesRange('5.1.0', '^5.1.0 || ^5.2.0')).toBe(true);
    expect(satisfiesRange('5.2.1', '^5.1.0 || ^5.2.0')).toBe(true);
    expect(satisfiesRange('4.0.0', '^5.1.0 || ^5.2.0')).toBe(false);
  });

  it('handles wildcards', () => {
    expect(satisfiesRange('9.9.9', '*')).toBe(true);
    expect(satisfiesRange('5.4.0', '5.x')).toBe(true);
    expect(satisfiesRange('6.0.0', '5.x')).toBe(false);
    expect(satisfiesRange('5.2.9', '5.2.x')).toBe(true);
    expect(satisfiesRange('5.3.0', '5.2.x')).toBe(false);
  });

  it('keeps a prerelease out of a range that did not ask for one', () => {
    expect(satisfiesRange('5.3.0-rc.1', '^5.2.0')).toBe(false);
    expect(satisfiesRange('6.0.0-rc.1', '>=5.1.0 <6.0.0')).toBe(false);
  });

  it('admits a prerelease when a comparator names that same version', () => {
    expect(satisfiesRange('5.3.0-rc.2', '>=5.3.0-rc.1 <6.0.0')).toBe(true);
    expect(satisfiesRange('5.3.0-rc.0', '>=5.3.0-rc.1 <6.0.0')).toBe(false);
  });

  it('throws on a range it cannot parse, so an unreadable range is never a silent pass', () => {
    expect(() => satisfiesRange('5.2.1', 'newest-ish')).toThrow();
    expect(() => satisfiesRange('5.2.1', '')).toThrow();
    expect(() => satisfiesRange('5.2.1', '5.1.0 - 5.3.0')).toThrow();
  });

  it('throws on a version it cannot parse', () => {
    expect(() => satisfiesRange('5.2', '^5.0.0')).toThrow();
  });
});
