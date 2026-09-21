import { describe, expect, it } from 'vitest';
import { canonicalJson, sha256Hex } from '../../src/index';

describe('canonicalJson', () => {
  it('sorts object keys so two spellings of the same value agree', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalJson({ a: 2, b: 1 })).toBe(canonicalJson({ b: 1, a: 2 }));
  });

  it('sorts nested keys too', () => {
    expect(canonicalJson({ outer: { z: [{ b: 1, a: 2 }], y: null } })).toBe(
      '{"outer":{"y":null,"z":[{"a":2,"b":1}]}}',
    );
  });

  it('keeps array order, which is meaningful', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
    expect(canonicalJson([1, 2, 3])).not.toBe(canonicalJson([3, 1, 2]));
  });

  it('sorts keys by code unit, not by locale', () => {
    expect(canonicalJson({ Z: 1, a: 2, A: 3 })).toBe('{"A":3,"Z":1,"a":2}');
  });

  it('escapes strings the way JSON does', () => {
    expect(canonicalJson({ s: 'a"b\\c\nd\u0001' })).toBe('{"s":"a\\"b\\\\c\\nd\\u0001"}');
  });

  it('writes scalars and null', () => {
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson(true)).toBe('true');
    expect(canonicalJson(-0)).toBe('0');
    expect(canonicalJson(1.5)).toBe('1.5');
    expect(canonicalJson('x')).toBe('"x"');
  });

  it('refuses values JSON cannot carry, rather than dropping them silently', () => {
    expect(() => canonicalJson(undefined)).toThrow(/undefined/i);
    expect(() => canonicalJson({ a: undefined })).toThrow(/undefined/i);
    expect(() => canonicalJson(Number.NaN)).toThrow(/finite/i);
    expect(() => canonicalJson(Number.POSITIVE_INFINITY)).toThrow(/finite/i);
    expect(() => canonicalJson(10n)).toThrow();
  });
});

describe('sha256Hex', () => {
  // FIPS 180-4 / NIST example vectors, so the implementation is checked against the
  // standard rather than against itself.
  it('hashes the empty string', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('hashes "abc"', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('hashes a message that spans two blocks', () => {
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('hashes a message whose padding needs a whole extra block', () => {
    // 56 bytes is the first length whose 1 + 8 bytes of padding no longer fit.
    expect(sha256Hex('a'.repeat(56))).toBe(
      'b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a',
    );
  });

  it('hashes an exact multiple of the block size', () => {
    expect(sha256Hex('a'.repeat(64))).toBe(
      'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb',
    );
  });

  it('hashes text as UTF-8, so one non-ASCII character is more than one byte', () => {
    expect(sha256Hex('\u00e9')).toBe(
      '4a99557e4033c3539de2eb65472017cad5f9557f7a0625a09f1c3f6e2ba69c4c',
    );
    // The same glyph spelled with a combining accent is a different message.
    expect(sha256Hex('e\u0301')).not.toBe(sha256Hex('\u00e9'));
  });

  it('returns 64 lowercase hex characters', () => {
    expect(sha256Hex('anything')).toMatch(/^[0-9a-f]{64}$/);
  });
});
