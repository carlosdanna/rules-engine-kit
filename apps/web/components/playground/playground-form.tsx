'use client';

/**
 * Choose a saved scenario, a profile and a seed; run; read the result (VR-7, FR-14).
 *
 * The run happens on the server, because it is stored: `runEvaluationAction` rebuilds the
 * profile from the database, evaluates and writes the row, and hands back the outcome and
 * trace so they render here without a second request. The stored copy lives at the
 * permalink.
 *
 * Changing the scenario resets the profile to the one its template suggests first. A
 * situation is closed over its content (ADR-0017), so any profile will run it, but only the
 * suggested one runs it against the edition its fixtures were read from.
 */

import Link from 'next/link';
import { useActionState, useState, useTransition } from 'react';
import { type RunPayload, runEvaluationAction } from '@/app/playground/actions';
import { OutcomeSummary } from '@/components/evaluations/outcome-summary';
import { TraceViewer } from '@/components/evaluations/trace-viewer';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { RunResult } from '@/lib/evaluations/run';
import type { ActionResult } from '@/lib/scenarios/types';

export type PlaygroundScenario = { id: string; name: string; defaultProfile: string };
export type PlaygroundProfile = { id: string; name: string };

export type PlaygroundFormProps = {
  scenarios: PlaygroundScenario[];
  profiles: PlaygroundProfile[];
  initialScenario: string | null;
};

/** Short and typeable, so a seed read off the screen can be typed back in. */
function randomSeed(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function PlaygroundForm({ scenarios, profiles, initialScenario }: PlaygroundFormProps) {
  const first = scenarios.find((s) => s.id === initialScenario) ?? scenarios[0];
  const [scenarioId, setScenarioId] = useState(first?.id ?? '');
  const [profileId, setProfileId] = useState(first?.defaultProfile ?? profiles[0]?.id ?? '');
  const [seed, setSeed] = useState('demo');

  const [pending, startTransition] = useTransition();
  const [result, submit] = useActionState<ActionResult<RunResult> | null, RunPayload>(
    runEvaluationAction,
    null,
  );
  const fieldErrors = result !== null && !result.ok ? result.fieldErrors : {};
  const formErrors = result !== null && !result.ok ? result.formErrors : [];
  const errorFor = (field: string) => {
    const message = fieldErrors[field];
    return message === undefined ? [] : [message].flat().map((text) => ({ message: text }));
  };

  function chooseScenario(next: string | null): void {
    if (next === null) return;
    setScenarioId(next);
    const scenario = scenarios.find((s) => s.id === next);
    if (scenario !== undefined) setProfileId(scenario.defaultProfile);
  }

  const run = result?.ok === true ? result.data : null;

  return (
    <div className="space-y-8">
      <form
        className="grid items-end gap-4 sm:grid-cols-[2fr_1fr_1fr_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(() => submit({ scenarioId, profileId, seed }));
        }}
      >
        <Field>
          <FieldLabel>Scenario</FieldLabel>
          <Select
            value={scenarioId}
            onValueChange={chooseScenario}
            items={scenarios.map((s) => ({ value: s.id, label: s.name }))}
          >
            <SelectTrigger aria-label="Scenario" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {scenarios.map((scenario) => (
                <SelectItem key={scenario.id} value={scenario.id}>
                  {scenario.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError errors={errorFor('scenarioId')} />
        </Field>

        <Field>
          <FieldLabel>Profile</FieldLabel>
          <Select value={profileId} onValueChange={(next) => setProfileId(next ?? profileId)}>
            <SelectTrigger aria-label="Profile" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {profiles.map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>
                  {profile.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError errors={errorFor('profileId')} />
        </Field>

        <Field>
          <FieldLabel htmlFor="seed">Seed</FieldLabel>
          <div className="flex gap-1">
            <Input
              id="seed"
              value={seed}
              onChange={(event) => setSeed(event.target.value)}
              className="font-mono"
            />
            <Button type="button" variant="outline" onClick={() => setSeed(randomSeed())}>
              Randomize
            </Button>
          </div>
          <FieldError errors={errorFor('seed')} />
        </Field>

        <Button type="submit" disabled={pending || scenarioId === '' || profileId === ''}>
          {pending ? 'Running…' : 'Run'}
        </Button>
      </form>

      {formErrors.length > 0 && (
        <div className="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive">
          {formErrors.map((message) => (
            <p key={message} className="whitespace-pre-wrap">
              {message}
            </p>
          ))}
        </div>
      )}

      {run !== null && (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Stored as{' '}
            <Link
              href={`/evaluations/${run.id}`}
              className="font-mono underline underline-offset-3"
            >
              /evaluations/{run.id}
            </Link>
          </p>
          <OutcomeSummary
            outcome={run.outcome}
            situation={run.situation}
            scenario={{
              id: run.scenarioId,
              name: scenarios.find((s) => s.id === run.scenarioId)?.name ?? run.scenarioId,
            }}
            profile={{
              id: run.profileId,
              name: profiles.find((p) => p.id === run.profileId)?.name ?? run.profileId,
            }}
          />
          <TraceViewer trace={run.trace} situation={run.situation} evaluationId={run.id} />
        </div>
      )}
    </div>
  );
}
