'use client';

/**
 * The trace viewer (FR-14, FR-15, NFR-7): one run's trace, grouped by step and then by phase.
 *
 * There is no `phaseStart` event (ADR-0010), so every step shows all eight phase headers and
 * groups its events under them with `groupByStepAndPhase`. A rule event shows its status,
 * the facts it read in read order, the state it changed and the section it cites. Rolls get a
 * block of their own, because the dice are the part a reader checks. Every other event kind
 * is one line, and that line is `narrateEvent`'s, so the tree and the narrative cannot
 * describe the same event two ways.
 *
 * `/compare` passes `highlight`: the alignment keys (`alignmentKey`, FR-16) of the events that
 * differ from the other side. Those events are outlined, and the phases holding them open.
 *
 * "Why didn't this fire?" calls `explain()` here in the browser. It is a lookup over the trace
 * already on the page and never re-evaluates (FR-15), so it needs no server round trip.
 */

import {
  alignmentKey,
  explain,
  type FactRead,
  groupByStepAndPhase,
  type NarrativeContext,
  narrateEvent,
  narrateTrace,
  narrativeContextFromSituation,
  PHASES,
  type Phase,
  type Situation,
  type SkipReason,
  stepPhaseKey,
  TRACE_SCHEMA_VERSION,
  type Trace,
  type TraceEvent,
  type TraceEventOfKind,
} from '@rules-engine-kit/engine';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export type TraceViewerProps = {
  trace: Trace;
  situation: Situation;
  /** Names the downloaded file; a playground run that has not been stored yet has none. */
  evaluationId?: string;
  /** Alignment keys of events that differ on the other side of a comparison. */
  highlight?: ReadonlySet<string>;
};

const DIFFERS = 'border-amber-500/70 bg-amber-500/10';

const json = (value: unknown): string => JSON.stringify(value);

function describeSkip(reason: SkipReason | undefined): string | null {
  if (reason === undefined) return null;
  switch (reason.kind) {
    case 'conditionFalse':
      return `condition false at ${reason.failedAt}`;
    case 'disabledByLayer':
      return `disabled by layer ${reason.layer}`;
    case 'supersededByLayer':
      return `superseded by layer ${reason.layer}`;
    case 'haltedEarlier':
      return `not reached: ${reason.byRuleKey} halted the step`;
  }
}

function downloadJson(trace: Trace, evaluationId: string | undefined): void {
  const url = URL.createObjectURL(
    new Blob([`${JSON.stringify(trace, null, 2)}\n`], { type: 'application/json' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `trace-${evaluationId ?? 'unsaved'}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** A condition can read one path twice, so a read's key is its path and which read of it this is. */
function keyedReads(reads: readonly FactRead[]): { key: string; fact: FactRead }[] {
  const seen = new Map<string, number>();
  return reads.map((fact) => {
    const n = (seen.get(fact.path) ?? 0) + 1;
    seen.set(fact.path, n);
    return { key: `${fact.path}#${n}`, fact };
  });
}

const STATUS_VARIANT = { fired: 'default', skipped: 'secondary', disabled: 'outline' } as const;

function WhyNot({ trace, ruleKey }: { trace: Trace; ruleKey: string }) {
  const explanation = useMemo(() => explain(trace, ruleKey), [trace, ruleKey]);
  return (
    <div className="mt-2 space-y-2 rounded-md border border-dashed bg-muted/40 p-2">
      <pre className="whitespace-pre-wrap font-mono text-xs">{explanation.narrative}</pre>
      {explanation.occurrences
        .filter((occurrence) => occurrence.reason?.kind === 'conditionFalse')
        .map((occurrence) => (
          <div key={`${occurrence.stepId}/${occurrence.phase}`} className="text-xs">
            <span className="font-mono">
              {occurrence.stepId} [{occurrence.phase}]
            </span>{' '}
            read{' '}
            {occurrence.factsRead.length === 0
              ? 'no facts'
              : occurrence.factsRead.map((fact) => `${fact.path} = ${json(fact.value)}`).join(', ')}
          </div>
        ))}
    </div>
  );
}

function RuleEvent({
  event,
  trace,
  differs,
}: {
  event: TraceEventOfKind<'rule'>;
  trace: Trace;
  differs: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const reason = describeSkip(event.reason);
  const { layer, version } = event.provenance;

  return (
    <li
      className={`space-y-1.5 rounded-md border p-2 ${differs ? DIFFERS : ''}`}
      data-testid="rule-event"
      data-differs={differs || undefined}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={STATUS_VARIANT[event.status]}>{event.status}</Badge>
        <span className="font-mono text-xs">{event.ruleKey}</span>
        {reason !== null && <span className="text-xs text-muted-foreground">{reason}</span>}
        <Link
          href={`/rulesets/${encodeURIComponent(layer)}/${encodeURIComponent(version)}?rule=${encodeURIComponent(event.ruleKey)}`}
          className="ml-auto text-xs text-muted-foreground underline underline-offset-3 hover:text-foreground"
        >
          {event.citation.source} · {event.citation.section}
        </Link>
      </div>

      {event.factsRead.length > 0 && (
        <table className="w-full text-xs">
          <tbody>
            {keyedReads(event.factsRead).map(({ key, fact }) => (
              <tr key={key} className="align-top">
                <td className="w-1/2 py-0.5 pr-2 font-mono text-muted-foreground">{fact.path}</td>
                <td className="py-0.5 font-mono">{json(fact.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {event.deltas.length > 0 && (
        <ul className="space-y-0.5 text-xs">
          {event.deltas.map((delta) => (
            <li key={delta.path} className="font-mono">
              {delta.path}: {json(delta.from)} → {json(delta.to)}
            </li>
          ))}
        </ul>
      )}

      {event.status !== 'fired' && (
        <div>
          <Button variant="ghost" size="xs" onClick={() => setAsking((open) => !open)}>
            {asking ? 'Hide explanation' : "Why didn't this fire?"}
          </Button>
          {asking && <WhyNot trace={trace} ruleKey={event.ruleKey} />}
        </div>
      )}
    </li>
  );
}

function RollEvent({ event, differs }: { event: TraceEventOfKind<'roll'>; differs: boolean }) {
  const signed = (value: number) => (value >= 0 ? `+${value}` : `${value}`);
  return (
    <li
      className={`space-y-1 rounded-md border p-2 text-xs ${differs ? DIFFERS : ''}`}
      data-testid="roll-event"
      data-differs={differs || undefined}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">roll</Badge>
        <span className="font-mono">{event.rollId}</span>
        <span className="text-muted-foreground">{event.mode}</span>
        {event.forced && <Badge variant="outline">forced</Badge>}
        <span className="ml-auto font-semibold">total {event.total}</span>
      </div>
      <div className="font-mono">
        dice [{event.dice.join(', ')}]
        {event.transforms.length > 0 && <> → [{event.diceAfterTransforms.join(', ')}]</>} · kept{' '}
        {event.kept}
        {event.modifiers.map((m) => ` ${signed(m.value)} ${m.modifierType}`).join('')}
      </div>
      {event.modeInputs.length > 0 && (
        <div className="text-muted-foreground">
          mode from {event.modeInputs.map((m) => `${m.mode} (${m.ruleKey})`).join(', ')}
        </div>
      )}
      {event.transforms.map((t) => (
        <div key={`${t.ruleKey}/${t.dieIndex}`} className="text-muted-foreground">
          {t.kind} by {t.ruleKey}: die {t.dieIndex} {t.from} → {t.to}
          {t.clamped && ' (clamped)'}
        </div>
      ))}
      {event.dropped.map((d) => (
        <div
          key={`${d.modifier.ruleKey}/${d.modifier.modifierType}`}
          className="text-muted-foreground"
        >
          dropped {signed(d.modifier.value)} {d.modifier.modifierType} ({d.policy}
          {d.beatenBy === undefined ? '' : `, beaten by ${d.beatenBy}`})
        </div>
      ))}
    </li>
  );
}

function OtherEvent({
  event,
  context,
  differs,
}: {
  event: TraceEvent;
  context: NarrativeContext;
  differs: boolean;
}) {
  return (
    <li
      className={`flex gap-2 rounded-md px-2 text-xs ${differs ? `border ${DIFFERS}` : ''}`}
      data-differs={differs || undefined}
    >
      <Badge variant="outline">{event.kind}</Badge>
      <span className="font-mono">{narrateEvent(event, context)?.trim() ?? event.kind}</span>
    </li>
  );
}

function phaseSummary(events: readonly TraceEvent[]): string {
  if (events.length === 0) return 'nothing';
  const rules = events.filter((event) => event.kind === 'rule');
  const fired = rules.filter((event) => event.status === 'fired').length;
  const others = events.length - rules.length;
  const parts = [];
  if (rules.length > 0) parts.push(`${fired}/${rules.length} rules fired`);
  if (others > 0) parts.push(`${others} event${others === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

function PhaseEvents({
  events,
  trace,
  context,
  highlight,
}: {
  events: readonly TraceEvent[];
  trace: Trace;
  context: NarrativeContext;
  highlight: ReadonlySet<string> | undefined;
}) {
  const differs = (event: TraceEvent) => highlight?.has(alignmentKey(event)) ?? false;
  return (
    <ul className="space-y-1.5">
      {events.map((event) =>
        event.kind === 'rule' ? (
          <RuleEvent key={event.seq} event={event} trace={trace} differs={differs(event)} />
        ) : event.kind === 'roll' ? (
          <RollEvent key={event.seq} event={event} differs={differs(event)} />
        ) : (
          <OtherEvent key={event.seq} event={event} context={context} differs={differs(event)} />
        ),
      )}
    </ul>
  );
}

export function TraceViewer({ trace, situation, evaluationId, highlight }: TraceViewerProps) {
  const [narrative, setNarrative] = useState(false);
  const context = useMemo(() => narrativeContextFromSituation(situation), [situation]);
  const groups = useMemo(() => groupByStepAndPhase(trace.events), [trace]);

  // A stored trace may predate or postdate this viewer; one it does not know is refused
  // rather than half-rendered (`packages/engine/src/version.ts`).
  const version = trace.traceSchemaVersion as number;
  if (version !== TRACE_SCHEMA_VERSION) {
    return (
      <p className="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive">
        This trace is schema v{version}; this viewer renders v{TRACE_SCHEMA_VERSION} only. Download
        the evaluation's JSON to read it.
      </p>
    );
  }

  return (
    <section className="space-y-4" aria-label="Trace">
      <div className="flex flex-wrap items-center gap-4">
        <h2 className="text-lg font-semibold">Trace</h2>
        <span className="text-sm text-muted-foreground">{trace.events.length} events</span>
        <div className="ml-auto flex items-center gap-4">
          <Label className="flex items-center gap-2 text-sm">
            <Switch
              checked={narrative}
              onCheckedChange={setNarrative}
              aria-label="Narrative view"
            />
            Narrative
          </Label>
          <Button variant="outline" size="sm" onClick={() => downloadJson(trace, evaluationId)}>
            Download JSON
          </Button>
        </div>
      </div>

      {narrative ? (
        <pre
          className="overflow-x-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs"
          data-testid="trace-narrative"
        >
          {narrateTrace(trace, context)}
        </pre>
      ) : (
        situation.timeline.map((step) => (
          <div key={step.id} className="space-y-1">
            <h3 className="text-sm font-medium">
              Round {step.round} · <span className="font-mono">{step.id}</span> —{' '}
              {context.actorNames[step.actorId] ?? step.actorId}
            </h3>
            <Accordion
              multiple
              className="rounded-lg border px-3"
              defaultValue={PHASES.filter((phase) =>
                (groups.get(stepPhaseKey(step.id, phase)) ?? []).some(
                  (event) => highlight?.has(alignmentKey(event)) ?? false,
                ),
              )}
            >
              {PHASES.map((phase: Phase) => {
                const events = groups.get(stepPhaseKey(step.id, phase)) ?? [];
                const changed = events.filter(
                  (event) => highlight?.has(alignmentKey(event)) ?? false,
                ).length;
                return (
                  <AccordionItem key={phase} value={phase} disabled={events.length === 0}>
                    <AccordionTrigger>
                      <span className="flex w-full items-center gap-3">
                        <span className="w-24 font-mono">{phase}</span>
                        <span className="text-xs font-normal text-muted-foreground">
                          {phaseSummary(events)}
                        </span>
                        {changed > 0 && (
                          <Badge variant="outline" className="border-amber-500/70">
                            {changed} differ{changed === 1 ? 's' : ''}
                          </Badge>
                        )}
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <PhaseEvents
                        events={events}
                        trace={trace}
                        context={context}
                        highlight={highlight}
                      />
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </div>
        ))
      )}
    </section>
  );
}
