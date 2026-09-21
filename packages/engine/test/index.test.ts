import { describe, expect, it } from 'vitest';
import { ENGINE_VERSION, TRACE_SCHEMA_VERSION } from '../src/index';

describe('engine package surface', () => {
  it('exports the versions recorded on every evaluation', () => {
    expect(ENGINE_VERSION).toBe('0.0.0');
    // ADR-0014 corrected ADR-0010's event list before anything was implemented, so the
    // first trace schema anyone can store is 1 and no reader has to handle 0.
    expect(TRACE_SCHEMA_VERSION).toBe(1);
  });
});
