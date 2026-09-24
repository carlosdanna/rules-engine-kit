/**
 * One situation, both SRD editions, diffed — the case `/compare` exists for (FR-16).
 *
 * The situation is the SRD 5.1 surprise golden case: a surprised guard attacks a goblin in
 * rounds 1 and 2. Derived from the two sections the packs cite, not from engine output:
 *
 * - SRD 5.1, Combat > The Order of Combat > Surprise: a surprised creature "can't move or take
 *   an action on its first turn of the combat". So `combat.surprise` fires in round 1's
 *   `declare` phase and halts the step.
 * - SRD 5.2.1, Rules Glossary > Surprise: a surprised combatant "has Disadvantage on its
 *   Initiative roll". The rule is in the `modifiers` phase, and round 1 here is an attack,
 *   not an Initiative check, so it is considered and does not fire — and the guard attacks.
 */

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadPacks } from '../../cli';
import { diffOutcomes, diffTraces } from '../../src/diff';
import { evaluate } from '../../src/evaluator';
import { resolveProfile } from '../../src/resolver';
import { CONTENT_DIR, loadCase } from '../golden/harness';

const golden = loadCase('surprised-at-combat-start-srd-5.1');

function runUnder(packDir: string) {
  const { packs, facts } = loadPacks([join(CONTENT_DIR, packDir)]);
  return evaluate(golden.situation, resolveProfile(packs), {
    seed: golden.manifest.seed,
    facts,
    forcedRolls: golden.forcedRolls,
  });
}

const a = runUnder('dnd5e-srd-5.1');
const b = runUnder('dnd5e-srd-5.2.1');

describe('SRD 5.1 vs SRD 5.2.1 on a surprised attacker (FR-16)', () => {
  const traces = diffTraces(a.trace, b.trace);
  const outcomes = diffOutcomes(a.outcome, b.outcome);

  it('finds combat.surprise fired under 5.1 only, in round 1 declare', () => {
    expect(traces.firedOnlyIn.a).toContainEqual({
      key: 'r1-guard|declare|combat.surprise',
      stepId: 'r1-guard',
      phase: 'declare',
      ruleKey: 'combat.surprise',
    });
    expect(traces.firedOnlyIn.b.map((rule) => rule.ruleKey)).not.toContain('combat.surprise');
  });

  it('finds 5.2.1 considering combat.surprise in modifiers and skipping it', () => {
    const considered = traces.events.find(
      (event) => event.key === 'r1-guard|modifiers|combat.surprise',
    );
    expect(considered?.a).toBeNull();
    expect(considered?.b).toMatchObject({ status: 'skipped' });
  });

  it('reports the halt as a value that differs, and the round-1 attack as 5.2.1 only', () => {
    expect(outcomes.values).toContainEqual({
      path: 'steps[r1-guard].halted',
      a: { ruleKey: 'combat.surprise', reason: expect.any(String) },
      b: null,
    });
    expect(outcomes.onlyB).toContain('steps[r1-guard].rolls[r1-guard/attack:guard]');
  });

  it('keeps the two profile hashes as identity, not as a difference', () => {
    expect(outcomes.identity.profileHash.a).not.toBe(outcomes.identity.profileHash.b);
  });
});
