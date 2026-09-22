/**
 * What a handler is given, and what it returns.
 *
 * Handlers never push to the trace. They mutate the store and the bus and *return* their
 * events, so the phase loop can emit the rule's own event — which carries the deltas these
 * effects produced — before the events the effects generated. Read in `seq` order that
 * becomes "the rule fired, and here is what it did".
 */

import type { Roller } from '../dice';
import type {
  ActorRef,
  EffectType,
  EmittedEvent,
  Phase,
  RollId,
  RollTarget,
  StateDelta,
  Step,
  TimePoint,
  TraceEventInput,
} from '../schema';
import type { TimelineIndex } from '../time';
import type { StepBus } from './bus';
import type { WorldStateStore } from './state';

export type EffectContext = {
  readonly step: Step;
  readonly stepIndex: number;
  readonly phase: Phase;
  /** Application time. Durations resolve against this (ADR-0012). */
  readonly now: TimePoint;
  readonly ruleKey: string;
  readonly store: WorldStateStore;
  readonly bus: StepBus;
  readonly roller: Roller;
  readonly timeline: TimelineIndex;
  /**
   * A list, not one id: `$target` on a three-target spell means all three. The effect type
   * is passed in so a failure can name the effect that could not resolve its ref.
   */
  resolveActorRefs(ref: ActorRef, effectType: EffectType): readonly string[];
  rollIdFor(target: RollTarget): RollId;
  derivedChannel(path: string, actorId: string): RollId;
  nextEffectId(): string;
};

export type EffectApplication = {
  deltas: StateDelta[];
  events: TraceEventInput[];
  /** Set by the `halt` effect; the phase loop ends the step on it. */
  halt?: { ruleKey: string; reason: string };
  emitted: EmittedEvent[];
};

export function emptyApplication(): EffectApplication {
  return { deltas: [], events: [], emitted: [] };
}
