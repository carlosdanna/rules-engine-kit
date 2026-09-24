'use client';

/**
 * The form view of a literal situation (FR-18): everything a situation holds except
 * `intents.rollChoices`, whose keys are roll ids and are edited in the JSON tab.
 *
 * The JSON text stays canonical. This renders only while the text parses, and every edit here
 * is written back as re-stringified JSON, so the two tabs can never disagree and a half-typed
 * brace in the JSON tab is never overwritten from here. The edits themselves are the pure
 * functions in `lib/scenarios/situation-edits.ts`, each of which returns a situation that still
 * parses — which is what keeps this form on screen while someone uses it.
 */

import type { ActorFixture, ItemFixture, Situation } from '@rules-engine-kit/engine';
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  addActorFromFixture,
  addBlankActor,
  addStep,
  removeActor,
  setAction,
  setIntent,
} from '@/lib/scenarios/situation-edits';
import { ActionEditor } from './action-editor';
import { ActorCard } from './actor-card';
import { FixtureAdder } from './fixture-adder';
import { IntField, Labelled } from './int-field';
import { ItemsSection } from './items-section';

type Props = {
  situation: Situation;
  onChange: (next: Situation) => void;
  /** Both already filtered to the editor's fixture profile (ADR-0026). */
  actorFixtures: ActorFixture[];
  itemFixtures: ItemFixture[];
  /** Suggestions for an actor's conditions; the list stays open (see `conditionNames`). */
  conditions: string[];
};

export function SituationForm({
  situation,
  onChange,
  actorFixtures,
  itemFixtures,
  conditions,
}: Props) {
  const setStep = (index: number, patch: Partial<Situation['timeline'][number]>): void =>
    onChange({
      ...situation,
      timeline: situation.timeline.map((step, at) => (at === index ? { ...step, ...patch } : step)),
    });

  const actorItems = situation.actors.map((actor) => ({ value: actor.id, label: actor.name }));
  const inspirationId = useId();

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium">Actors</h3>
          <div className="flex flex-wrap items-center gap-2">
            <FixtureAdder
              label="Add actor from fixture"
              fixtures={actorFixtures}
              onAdd={(fixture) => onChange(addActorFromFixture(situation, fixture))}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange(addBlankActor(situation))}
            >
              Add blank actor
            </Button>
          </div>
        </header>
        <p className="text-sm text-muted-foreground">
          Printed values only: attack bonuses, save DCs and effective AC are worked out by the
          rules, with their terms in the trace.
        </p>

        {situation.actors.map((actor, index) => (
          <ActorCard
            key={actor.id}
            actor={actor}
            index={index}
            conditions={conditions}
            removable={situation.actors.length > 1}
            onChange={(patch) =>
              onChange({
                ...situation,
                actors: situation.actors.map((each, at) =>
                  at === index ? { ...each, ...patch } : each,
                ),
              })
            }
            onRemove={() => onChange(removeActor(situation, index))}
          />
        ))}
      </section>

      <ItemsSection situation={situation} fixtures={itemFixtures} onChange={onChange} />

      <section className="space-y-4">
        <header className="flex items-center justify-between">
          <h3 className="font-medium">Timeline</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange(addStep(situation))}
          >
            Add step
          </Button>
        </header>
        <p className="text-sm text-muted-foreground">
          One turn per step, in order. Rounds never go backwards; time ticks between steps even when
          a step takes no action.
        </p>

        {situation.timeline.map((step, index) => (
          <div key={step.id} className="space-y-3 rounded-lg border p-3">
            <div className="flex flex-wrap items-end gap-3">
              <span className="pb-2 font-mono text-xs text-muted-foreground">{step.id}</span>
              <IntField
                label="Round"
                min={Math.max(1, situation.timeline[index - 1]?.round ?? 1)}
                value={step.round}
                onChange={(round) => {
                  // Clamped to its neighbours, so the edit cannot make the rounds go backwards.
                  const low = situation.timeline[index - 1]?.round ?? 1;
                  const high = situation.timeline[index + 1]?.round ?? Number.POSITIVE_INFINITY;
                  setStep(index, { round: Math.min(Math.max(round, low, 1), high) });
                }}
              />
              <Labelled label="Actor">
                <Select
                  items={actorItems}
                  value={step.actorId}
                  onValueChange={(actorId) => actorId !== null && setStep(index, { actorId })}
                >
                  <SelectTrigger aria-label={`Step ${index + 1} actor`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {actorItems.map((actor) => (
                      <SelectItem key={actor.value} value={actor.value}>
                        {actor.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Labelled>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto"
                disabled={situation.timeline.length === 1}
                onClick={() =>
                  onChange({
                    ...situation,
                    timeline: situation.timeline.filter((_, at) => at !== index),
                  })
                }
              >
                Remove
              </Button>
            </div>
            <ActionEditor
              situation={situation}
              index={index}
              onChange={(action) => onChange(setAction(situation, index, action))}
            />
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h3 className="font-medium">Player choices</h3>
        <p className="text-sm text-muted-foreground">
          Declared up front, because evaluation never pauses to ask. Which die a reroll touches is
          keyed by roll id and is set in the JSON tab (<code>intents.rollChoices</code>).
        </p>
        <div className="flex items-center gap-2 text-sm">
          <Switch
            id={inspirationId}
            checked={situation.intents.useInspiration === true}
            onCheckedChange={(on) => onChange(setIntent(situation, 'useInspiration', on))}
          />
          <label htmlFor={inspirationId}>Use inspiration</label>
        </div>
      </section>
    </div>
  );
}
