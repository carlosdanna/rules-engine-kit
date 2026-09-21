import { describe, expect, it } from 'vitest';
import { ENGINE_VERSION, TRACE_SCHEMA_VERSION } from '../src/index.js';

describe('engine package surface', () => {
  it('exports the versions recorded on every evaluation', () => {
    expect(ENGINE_VERSION).toBe('0.0.0');
    expect(TRACE_SCHEMA_VERSION).toBe('0.0.0');
  });
});
