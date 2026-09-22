/**
 * Every golden case under `cases/`, run the same way.
 *
 * The four assertions are deliberately four `it`s rather than one. NFR-4 asks for outcomes
 * to be asserted "separately from trace snapshots" and the risk register names golden
 * snapshot churn as the thing that costs — so a trace-format change has to be able to fail
 * the trace assertion while leaving the rules claims green. ADR-0019 put it plainly:
 * "golden trace snapshots change once; outcome assertions must not change." Splitting the
 * `it`s is what makes that visible in a test report instead of a matter of trust.
 */

import { describe, expect, it } from 'vitest';
import { narrateTrace, narrativeContextFromSituation } from '../../src/trace';
import { ENGINE_VERSION, TRACE_SCHEMA_VERSION } from '../../src/version';
import { discoverCases, type GoldenCase, runCase } from './harness';

const cases = discoverCases();

it('finds the golden cases', () => {
  // A harness that silently discovers nothing would let every case below disappear without
  // a single failure.
  expect(cases.length).toBeGreaterThan(0);
});

describe.each(cases.map((golden): [string, GoldenCase] => [golden.name, golden]))(
  'golden — %s',
  (_name, golden) => {
    it(golden.manifest.description, () => {
      expect(runCase(golden).outcome).toMatchObject(golden.expected);
    });

    it('records what produced it (VR-7)', () => {
      const { outcome } = runCase(golden);
      expect(outcome.seed).toBe(golden.manifest.seed);
      expect(outcome.engineVersion).toBe(ENGINE_VERSION);
      expect(outcome.traceSchemaVersion).toBe(TRACE_SCHEMA_VERSION);
      // The hash itself is not hand-derivable, so what is asserted is the property that
      // makes it useful: the same profile hashes the same way every time (ADR-0009).
      expect(outcome.profileHash).toBe(runCase(golden).outcome.profileHash);
      expect(outcome.profileHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    });

    it('is deterministic for the same seed (NFR-1)', () => {
      expect(runCase(golden)).toEqual(runCase(golden));
    });

    it('matches its trace snapshots', async () => {
      const { trace } = runCase(golden);

      await expect(`${JSON.stringify(trace, null, 2)}\n`).toMatchFileSnapshot(
        `${golden.dir}/trace.snap.txt`,
      );
      await expect(
        `${narrateTrace(trace, narrativeContextFromSituation(golden.situation))}\n`,
      ).toMatchFileSnapshot(`${golden.dir}/narrative.snap.txt`);
    });
  },
);
