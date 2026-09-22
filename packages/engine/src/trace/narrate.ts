/**
 * The trace as narrative text (NFR-7). The format follows the worked rendering in
 * `docs/spike-notes.md` §1, which is the closest thing to a spec this has.
 *
 * `NarrativeContext` is optional and everything degrades to raw ids, because a stored
 * evaluation may reach `/evaluations/[id]` as a trace alone: `ActorState` carries no name.
 */

import type { AppliedModifier, DroppedModifier, Situation, Trace, TraceEvent } from '../schema';
import { formatTimePoint } from '../time';

export type NarrativeContext = {
  /** Shaped like `Outcome.steps`, so a stored run narrates without its situation. */
  steps: readonly { id: string; round: number; actorId: string }[];
  actorNames: Record<string, string>;
};

export function narrativeContextFromSituation(situation: Situation): NarrativeContext {
  return {
    steps: situation.timeline.map((step) => ({
      id: step.id,
      round: step.round,
      actorId: step.actorId,
    })),
    actorNames: Object.fromEntries(situation.actors.map((actor) => [actor.id, actor.name])),
  };
}

function actorName(actorId: string, context?: NarrativeContext): string {
  return context?.actorNames[actorId] ?? actorId;
}

function signed(value: number): string {
  return `${value >= 0 ? '+' : '-'}${Math.abs(value)}`;
}

function modifierList(modifiers: readonly AppliedModifier[]): string {
  return modifiers.map((m) => `${signed(m.value)} ${m.modifierType}`).join(' ');
}

function droppedList(dropped: readonly DroppedModifier[]): string {
  if (dropped.length === 0) return '';
  const parts = dropped.map((d) => {
    const beaten = d.beatenBy === undefined ? '' : `, beaten by ${d.beatenBy}`;
    return `${signed(d.modifier.value)} ${d.modifier.modifierType}${beaten}`;
  });
  return ` (dropped ${parts.join('; ')})`;
}

/** Returns `null` for events that add nothing to the prose at this verbosity. */
export function narrateEvent(event: TraceEvent, context?: NarrativeContext): string | null {
  switch (event.kind) {
    case 'rule':
      return event.status === 'fired'
        ? `  [${event.phase}] ${event.ruleKey} fired (${event.citation.source} · ${event.citation.section})`
        : null;

    case 'roll': {
      const mode =
        event.modeInputs.map((m) => `${m.mode} from ${m.ruleKey}`).join(' + ') || 'no mode inputs';
      const transforms = event.transforms
        .map((t) => {
          // ADR-0011 wants the clamp visible; since ADR-0019 it is a field rather than an
          // event of its own, so the narration has to say it here or it is said nowhere.
          const clamped = t.clamped ? ' (clamped into the pool)' : '';
          return `${t.kind} die[${t.dieIndex}]${clamped} ${t.from}→${t.to} (${t.ruleKey})`;
        })
        .join('; ');
      const pool =
        transforms === ''
          ? JSON.stringify(event.dice)
          : `${JSON.stringify(event.dice)} → ${transforms} → ${JSON.stringify(event.diceAfterTransforms)}`;
      return [
        `  [roll] ${event.target.kind}:${actorName(event.target.actorId, context)}: ${mode} ⇒ ${event.mode}`,
        `         dice ${pool}`,
        `         kept ${event.kept} ${modifierList(event.modifiers)} = ${event.total}${droppedList(event.dropped)}`,
      ].join('\n');
    }

    case 'compare':
      return `  [compare] ${event.total} vs DC ${event.dc} → ${event.result}`;

    case 'stacking': {
      const terms = modifierList(event.applied);
      const whose = actorName(event.actorId, context);
      return `  [stacking] ${event.target} for ${whose}: ${terms === '' ? 'no contributions' : terms}${droppedList(event.dropped)}`;
    }

    case 'effectApplied': {
      const on = actorName(event.onActorId, context);
      const until =
        event.expiresAt.kind === 'permanent'
          ? 'permanently'
          : event.expiresAt.kind === 'beyondTimeline'
            ? `until round ${event.expiresAt.wouldExpireInRound}, beyond this timeline`
            : `until ${formatTimePoint(event.expiresAt.point)}`;
      return `  [apply] ${event.sourceRuleKey} on ${on}, ${until}`;
    }

    case 'expiry': {
      // ADR-0012: expiry is anchored to the source, not the carrier, and that is observable
      // — so the line names whose turn the anchor point *is*, and says separately whose turn
      // it was swept on when the two differ. That gap is the surprising case the ADR calls out.
      const anchorStep = context?.steps[event.at.stepIndex];
      const whose =
        anchorStep === undefined
          ? formatTimePoint(event.at)
          : `the ${event.at.edge} of ${actorName(anchorStep.actorId, context)}'s turn, round ${event.at.round}`;
      const sweptElsewhere =
        anchorStep !== undefined && anchorStep.id !== event.stepId
          ? `, swept during ${actorName(context?.steps.find((s) => s.id === event.stepId)?.actorId ?? '', context)}'s turn`
          : '';
      return `  [expire] ${event.sourceRuleKey} ended at ${whose}${sweptElsewhere}`;
    }

    case 'event':
      return `  [event] ${event.event}`;
  }
}

export function narrateTrace(trace: Trace, context?: NarrativeContext): string {
  const lines: string[] = [];
  let currentStep: string | null = null;

  for (const event of trace.events) {
    if (event.stepId !== currentStep) {
      currentStep = event.stepId;
      const step = context?.steps.find((candidate) => candidate.id === event.stepId);
      const who = step === undefined ? '' : ` — ${actorName(step.actorId, context)}`;
      lines.push(`round ${event.round}, ${event.stepId}${who}`);
    }
    const line = narrateEvent(event, context);
    if (line !== null) lines.push(line);
  }

  return lines.join('\n');
}
