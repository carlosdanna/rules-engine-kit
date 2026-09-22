/**
 * `evaluate(situation, profile, opts)` — the engine's entry point (FR-3, NFR-1).
 *
 * Pure: no I/O, no clock, no global randomness. Every die comes from the injected seeded
 * roller, state updates are immutable, and the inputs are never mutated (ADR-0002).
 */

import { registryFromFacts } from '../conditions';
import { createRoller } from '../dice';
import { createWorldStateStore } from '../effects';
import {
  type DerivedValue,
  type EmittedEvent,
  type EvaluationResult,
  type FactDefinition,
  type ResolvedProfile,
  type ResolvedRule,
  type RollId,
  Situation,
  type StepOutcome,
} from '../schema';
import { buildTimelineIndex } from '../time';
import { createTraceBuilder, type TraceLevel } from '../trace';
import { ENGINE_VERSION, TRACE_SCHEMA_VERSION } from '../version';
import { runStep } from './step';

export type EvaluateOptions = {
  seed: string;
  /** Keyed by roll id, not step id, so adding a rule cannot shift a later value (ADR-0011). */
  forcedRolls?: Record<RollId, number[]>;
  traceLevel?: TraceLevel;
  /**
   * The pack's fact definitions. They arrive here rather than on `ResolvedProfile` because
   * that type feeds the profile hash, and widening it would change every stored hash
   * (ADR-0009, VR-7). The engine registers nothing of its own: packs declare every path,
   * including the derived ones, so `content:lint` and the evaluator cannot disagree.
   */
  facts?: readonly FactDefinition[];
};

export function evaluate(
  situation: Situation,
  profile: ResolvedProfile,
  opts: EvaluateOptions,
): EvaluationResult {
  // The situation is user-editable input, so it is parsed rather than trusted (FR-1).
  const parsed = Situation.parse(situation);

  const registry = registryFromFacts(opts.facts ?? []);
  const roller = createRoller({
    seed: opts.seed,
    ...(opts.forcedRolls === undefined ? {} : { forcedRolls: opts.forcedRolls }),
  });
  const timeline = buildTimelineIndex(parsed.timeline);
  const store = createWorldStateStore({ actors: parsed.actors, registry });
  const trace = createTraceBuilder({ level: opts.traceLevel ?? 'full' });
  const rulesByKey: ReadonlyMap<string, ResolvedRule> = new Map(
    profile.rules.map((rule) => [rule.key, rule]),
  );

  let effectCounter = 0;
  const nextEffectId = () => `eff-${++effectCounter}`;

  const steps: StepOutcome[] = [];
  const derived: DerivedValue[] = [];
  const events: EmittedEvent[] = [];

  for (const [stepIndex, step] of parsed.timeline.entries()) {
    const result = runStep({
      step,
      stepIndex,
      profile,
      registry,
      store,
      roller,
      timeline,
      trace,
      intents: parsed.intents,
      items: parsed.items,
      rulesByKey,
      nextEffectId,
    });
    steps.push(result.outcome);
    // Flat and in evaluation order, each entry naming its own step (ADR-0019): the array
    // is what `diffOutcomes` aligns over, and `(stepId, path, actorId)` is the key.
    derived.push(...result.derived);
    events.push(...result.emitted);
  }

  return {
    outcome: {
      steps,
      finalState: store.snapshot(),
      derived,
      events,
      seed: opts.seed,
      profileHash: profile.hash,
      engineVersion: ENGINE_VERSION,
      traceSchemaVersion: TRACE_SCHEMA_VERSION,
    },
    trace: trace.build(),
  };
}
