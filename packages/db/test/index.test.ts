import { describe, expect, it } from 'vitest';
import { DB_SCHEMA_VERSION, SEEDED_ENGINE_VERSION } from '../src/index.js';

describe('db package surface', () => {
  it('exposes its schema version', () => {
    expect(DB_SCHEMA_VERSION).toBe('0.0.0');
  });

  it('re-exports the engine version it depends on', () => {
    expect(SEEDED_ENGINE_VERSION).toBe('0.0.0');
  });
});
