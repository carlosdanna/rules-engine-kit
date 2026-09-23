'use client';

/**
 * The form view of a literal situation (FR-18): the edits people make most — who is in it,
 * their printed numbers, and when each acts. Anything more structured (an action, an item, an
 * intent) is edited in the JSON tab, which is the promise `content-authoring.md` makes.
 *
 * The JSON text stays canonical. This renders only while the text parses, and every edit here
 * is written back as re-stringified JSON, so the two tabs can never disagree and a half-typed
 * brace in the JSON tab is never overwritten from here.
 */

import { ABILITIES, type Actor, type Situation } from '@rules-engine-kit/engine';
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Props = { situation: Situation; onChange: (next: Situation) => void };

/** An integer field that never hands back a string, since the schema checks without coercing. */
function IntField({
  label,
  value,
  onChange,
  min,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1 text-xs text-muted-foreground">
      <label htmlFor={id}>{label}</label>
      <Input
        id={id}
        type="number"
        step={1}
        min={min}
        value={String(value)}
        aria-label={label}
        onChange={(event) => {
          const parsed = Number.parseInt(event.target.value, 10);
          if (!Number.isNaN(parsed)) onChange(parsed);
        }}
      />
    </div>
  );
}

/** The first `actor-N` id nothing holds yet: ids are what steps and targets address. */
function freshActorId(actors: readonly Actor[]): string {
  const taken = new Set(actors.map((actor) => actor.id));
  for (let n = actors.length + 1; ; n += 1) {
    if (!taken.has(`actor-${n}`)) return `actor-${n}`;
  }
}

export function SituationForm({ situation, onChange }: Props) {
  const setActor = (index: number, patch: Partial<Actor>): void =>
    onChange({
      ...situation,
      actors: situation.actors.map((actor, at) => (at === index ? { ...actor, ...patch } : actor)),
    });

  const addActor = (): void => {
    const template = situation.actors[0];
    if (template === undefined) return;
    const id = freshActorId(situation.actors);
    onChange({
      ...situation,
      actors: [
        ...situation.actors,
        { ...template, id, name: `Actor ${situation.actors.length + 1}`, conditions: [] },
      ],
    });
  };

  const removeActor = (index: number): void => {
    const gone = situation.actors[index]?.id;
    onChange({
      ...situation,
      actors: situation.actors.filter((_, at) => at !== index),
      // A step taken by the removed actor goes with it; the schema would reject it otherwise.
      timeline: situation.timeline.filter((step) => step.actorId !== gone),
    });
  };

  const addStep = (): void => {
    const last = situation.timeline.at(-1);
    const actorId = situation.actors[0]?.id ?? 'actor';
    const round = (last?.round ?? 0) + 1;
    const taken = new Set(situation.timeline.map((step) => step.id));
    let id = `r${round}-${actorId}`;
    for (let n = 2; taken.has(id); n += 1) id = `r${round}-${actorId}-${n}`;
    onChange({
      ...situation,
      timeline: [...situation.timeline, { id, round, actorId, action: null }],
    });
  };

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <header className="flex items-center justify-between">
          <h3 className="font-medium">Actors</h3>
          <Button type="button" variant="outline" size="sm" onClick={addActor}>
            Add actor
          </Button>
        </header>

        {situation.actors.map((actor, index) => (
          <fieldset key={actor.id} className="space-y-3 rounded-lg border p-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
                <label htmlFor={`${actor.id}-name`}>Name</label>
                <Input
                  id={`${actor.id}-name`}
                  value={actor.name}
                  aria-label={`Actor ${index + 1} name`}
                  onChange={(event) => setActor(index, { name: event.target.value })}
                />
              </div>
              <span className="pb-2 font-mono text-xs text-muted-foreground">{actor.id}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={situation.actors.length === 1}
                onClick={() => removeActor(index)}
              >
                Remove
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <IntField label="AC" value={actor.ac} onChange={(ac) => setActor(index, { ac })} />
              <IntField
                label="HP"
                min={0}
                value={actor.hp}
                onChange={(hp) => setActor(index, { hp, hpCurrent: Math.min(actor.hpCurrent, hp) })}
              />
              <IntField
                label="HP current"
                min={0}
                value={actor.hpCurrent}
                onChange={(hpCurrent) => setActor(index, { hpCurrent })}
              />
              <IntField
                label="Proficiency"
                min={0}
                value={actor.proficiencyBonus}
                onChange={(proficiencyBonus) => setActor(index, { proficiencyBonus })}
              />
            </div>

            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {ABILITIES.map((ability) => (
                <IntField
                  key={ability}
                  label={ability.toUpperCase()}
                  value={actor.abilities[ability] ?? 10}
                  onChange={(score) =>
                    setActor(index, { abilities: { ...actor.abilities, [ability]: score } })
                  }
                />
              ))}
            </div>
          </fieldset>
        ))}
      </section>

      <section className="space-y-4">
        <header className="flex items-center justify-between">
          <h3 className="font-medium">Timeline</h3>
          <Button type="button" variant="outline" size="sm" onClick={addStep}>
            Add step
          </Button>
        </header>
        <p className="text-sm text-muted-foreground">
          Who acts, and in which round. What they do is edited in the JSON tab.
        </p>

        {situation.timeline.map((step, index) => (
          <div key={step.id} className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
            <span className="pb-2 font-mono text-xs text-muted-foreground">{step.id}</span>
            <IntField
              label="Round"
              min={1}
              value={step.round}
              onChange={(round) =>
                onChange({
                  ...situation,
                  timeline: situation.timeline.map((s, at) => (at === index ? { ...s, round } : s)),
                })
              }
            />
            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
              Actor
              <Select
                value={step.actorId}
                onValueChange={(actorId) =>
                  onChange({
                    ...situation,
                    timeline: situation.timeline.map((s, at) =>
                      at === index ? { ...s, actorId: actorId ?? s.actorId } : s,
                    ),
                  })
                }
              >
                <SelectTrigger aria-label={`Step ${index + 1} actor`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {situation.actors.map((actor) => (
                    <SelectItem key={actor.id} value={actor.id}>
                      {actor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <span className="pb-2 text-xs text-muted-foreground">
              {step.action === null ? 'no action' : step.action.type}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
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
        ))}
      </section>
    </div>
  );
}
