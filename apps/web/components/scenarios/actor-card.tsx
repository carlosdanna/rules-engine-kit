'use client';

/**
 * One actor's printed values (ADR-0006): stats, ability scores, and the lists the rules read —
 * conditions, resistances and vulnerabilities. The lists are open, like a template's
 * `conditionList`: the suggestions are only what the seeded content already names.
 */

import { ABILITIES, type Actor } from '@rules-engine-kit/engine';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IntField, Labelled } from './int-field';
import { ConditionPicker } from './param-controls';

/** The damage types SRD 5.1 and 5.2.1 both list (Combat > Damage Types), as the rules read them. */
const DAMAGE_TYPES = [
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder',
];

type Props = {
  actor: Actor;
  index: number;
  conditions: string[];
  removable: boolean;
  onChange: (patch: Partial<Actor>) => void;
  onRemove: () => void;
};

export function ActorCard({ actor, index, conditions, removable, onChange, onRemove }: Props) {
  const label = `Actor ${index + 1}`;

  return (
    <fieldset className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <Labelled label="Name">
            <Input
              value={actor.name}
              aria-label={`${label} name`}
              onChange={(event) => onChange({ name: event.target.value })}
            />
          </Labelled>
        </div>
        <span className="pb-2 font-mono text-xs text-muted-foreground">{actor.id}</span>
        <Button type="button" variant="ghost" size="sm" disabled={!removable} onClick={onRemove}>
          Remove
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <IntField label="AC" value={actor.ac} onChange={(ac) => onChange({ ac })} />
        <IntField
          label="HP"
          min={0}
          value={actor.hp}
          onChange={(hp) => onChange({ hp, hpCurrent: Math.min(actor.hpCurrent, hp) })}
        />
        <IntField
          label="HP current"
          min={0}
          value={actor.hpCurrent}
          onChange={(hpCurrent) => onChange({ hpCurrent })}
        />
        <IntField
          label="Proficiency"
          min={0}
          value={actor.proficiencyBonus}
          onChange={(proficiencyBonus) => onChange({ proficiencyBonus })}
        />
      </div>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {ABILITIES.map((ability) => (
          <IntField
            key={ability}
            label={ability.toUpperCase()}
            value={actor.abilities[ability] ?? 10}
            onChange={(score) => onChange({ abilities: { ...actor.abilities, [ability]: score } })}
          />
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Labelled label="Conditions">
          <ConditionPicker
            name={`${label} conditions`}
            value={actor.conditions}
            suggestions={conditions}
            onChange={(next) => onChange({ conditions: next })}
          />
        </Labelled>
        <Labelled label="Resistances">
          <ConditionPicker
            name={`${label} resistances`}
            noun="damage type"
            value={actor.resistances}
            suggestions={DAMAGE_TYPES}
            onChange={(next) => onChange({ resistances: next })}
          />
        </Labelled>
        <Labelled label="Vulnerabilities">
          <ConditionPicker
            name={`${label} vulnerabilities`}
            noun="damage type"
            value={actor.vulnerabilities}
            suggestions={DAMAGE_TYPES}
            onChange={(next) => onChange({ vulnerabilities: next })}
          />
        </Labelled>
      </div>
    </fieldset>
  );
}
