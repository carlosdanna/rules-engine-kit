/**
 * What a run came to, and what produced it (VR-7).
 *
 * The four identity fields come from the outcome itself, not the evaluation row: the engine
 * stamps them, and a summary that read them from anywhere else could disagree with the run.
 * Actor names come from the situation, because `ActorState` carries none.
 */

import type { Outcome, Situation } from '@rules-engine-kit/engine';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export type OutcomeSummaryProps = {
  outcome: Outcome;
  situation: Situation;
  scenario: { id: string; name: string };
  profile: { id: string; name: string };
};

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-mono text-sm">{children}</dd>
    </div>
  );
}

export function OutcomeSummary({ outcome, situation, scenario, profile }: OutcomeSummaryProps) {
  const names = Object.fromEntries(situation.actors.map((actor) => [actor.id, actor.name]));
  const name = (id: string) => names[id] ?? id;

  return (
    <Card data-testid="outcome-summary">
      <CardHeader>
        <CardTitle>Outcome</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Meta label="Scenario">
            <Link href={`/scenarios/${scenario.id}`} className="underline underline-offset-3">
              {scenario.name}
            </Link>
          </Meta>
          <Meta label="Profile">{profile.id}</Meta>
          <Meta label="Seed">{outcome.seed}</Meta>
          <Meta label="Profile hash">
            <span title={outcome.profileHash}>{outcome.profileHash}</span>
          </Meta>
          <Meta label="Engine">v{outcome.engineVersion}</Meta>
          <Meta label="Trace schema">v{outcome.traceSchemaVersion}</Meta>
        </dl>

        <ol className="space-y-2">
          {outcome.steps.map((step) => (
            <li key={step.stepId} className="rounded-md border p-2 text-sm">
              <div className="mb-1 text-xs text-muted-foreground">
                Round {step.round} · <span className="font-mono">{step.stepId}</span> —{' '}
                {name(step.actorId)}
              </div>
              {step.comparisons.map((comparison) => (
                <div
                  key={`${comparison.rollId ?? 'passive'}/${comparison.target.kind}:${comparison.target.actorId}`}
                >
                  {name(comparison.target.actorId)} {comparison.target.kind}: {comparison.total} vs{' '}
                  {comparison.dc} →{' '}
                  <Badge
                    variant={
                      comparison.result === 'hit' || comparison.result === 'success'
                        ? 'default'
                        : 'secondary'
                    }
                  >
                    {comparison.result}
                  </Badge>
                </div>
              ))}
              {step.damage.map((damage) => (
                <div key={`${damage.actorId}/${damage.damageType}`}>
                  {name(damage.actorId)} takes {damage.amount} {damage.damageType} (HP{' '}
                  {damage.hpAfter}
                  {damage.overflow > 0 ? `, ${damage.overflow} past 0` : ''})
                </div>
              ))}
              {step.halted !== null && (
                <div className="text-muted-foreground">
                  halted by <span className="font-mono">{step.halted.ruleKey}</span>:{' '}
                  {step.halted.reason}
                </div>
              )}
              {step.comparisons.length === 0 &&
                step.damage.length === 0 &&
                step.halted === null && (
                  <div className="text-muted-foreground">nothing rolled or dealt</div>
                )}
            </li>
          ))}
        </ol>

        <div className="space-y-1">
          <h3 className="text-xs text-muted-foreground">Final state</h3>
          <ul className="flex flex-wrap gap-2">
            {Object.values(outcome.finalState.actors).map((actor) => (
              <li key={actor.id} className="rounded-md border px-2 py-1 text-sm">
                {name(actor.id)}: HP {actor.hpCurrent}
                {actor.conditions.length > 0 && ` · ${actor.conditions.join(', ')}`}
              </li>
            ))}
          </ul>
          {outcome.finalState.activeEffects.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {outcome.finalState.activeEffects.length} effect
              {outcome.finalState.activeEffects.length === 1 ? '' : 's'} still running at the end of
              the timeline
            </p>
          )}
          {outcome.events.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Emitted:{' '}
              {outcome.events.map((event) => `${event.event} (${event.stepId})`).join(', ')}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
