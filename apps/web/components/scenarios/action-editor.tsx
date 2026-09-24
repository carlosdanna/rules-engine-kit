'use client';

/**
 * What one step does (FR-18): the action's type, then the fields that type carries.
 *
 * Changing the type starts from `defaultAction`, which parses as it stands, so the form never
 * hands the JSON text something the schema rejects. Targets and weapons are picked from what the
 * situation already holds — an attack can only name a weapon inlined in `items` (ADR-0017).
 */

import { ABILITIES, type Action, type Situation } from '@rules-engine-kit/engine';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { type ActionType, defaultAction } from '@/lib/scenarios/situation-edits';
import { IntField, Labelled } from './int-field';

const NONE = 'none';

const TYPES: { value: ActionType | typeof NONE; label: string }[] = [
  { value: NONE, label: 'No action' },
  { value: 'attack', label: 'Attack' },
  { value: 'cast', label: 'Cast a spell' },
  { value: 'check', label: 'Ability check' },
  { value: 'save', label: 'Saving throw' },
  { value: 'useObject', label: 'Use an object' },
];

type Props = {
  situation: Situation;
  index: number;
  onChange: (action: Action | null) => void;
};

export function ActionEditor({ situation, index, onChange }: Props) {
  const step = situation.timeline[index];
  if (step === undefined) return null;
  const { action } = step;
  const label = `Step ${index + 1}`;

  const actorItems = situation.actors.map((actor) => ({ value: actor.id, label: actor.name }));

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Labelled label="Does">
        <Select
          items={TYPES}
          value={action?.type ?? NONE}
          onValueChange={(next) => {
            const type = TYPES.find((option) => option.value === next)?.value ?? NONE;
            onChange(defaultAction(situation, index, type === NONE ? null : type));
          }}
        >
          <SelectTrigger aria-label={`${label} action`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Labelled>

      {action?.type === 'attack' && (
        <>
          <Labelled label="Mode">
            <Select
              value={action.mode}
              onValueChange={(mode) => mode !== null && onChange({ ...action, mode })}
            >
              <SelectTrigger aria-label={`${label} attack mode`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="melee">melee</SelectItem>
                <SelectItem value="ranged">ranged</SelectItem>
              </SelectContent>
            </Select>
          </Labelled>
          <Labelled label="Target">
            <Select
              items={actorItems}
              value={action.targetId}
              onValueChange={(targetId) => targetId !== null && onChange({ ...action, targetId })}
            >
              <SelectTrigger aria-label={`${label} target`}>
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
          <WeaponSelect
            label={label}
            situation={situation}
            value={action.weapon}
            onChange={(weapon) => onChange({ ...action, weapon })}
          />
          <IntField
            label="Range (ft)"
            min={0}
            value={action.rangeFt}
            onChange={(rangeFt) => onChange({ ...action, rangeFt: Math.max(0, rangeFt) })}
          />
        </>
      )}

      {action?.type === 'cast' && (
        <>
          <Labelled label="Spell">
            <Input
              value={action.spell}
              aria-label={`${label} spell`}
              className="w-32"
              onChange={(event) =>
                // An empty spell would not parse; keep the last name until one is typed.
                event.target.value.trim() !== '' &&
                onChange({ ...action, spell: event.target.value.trim() })
              }
            />
          </Labelled>
          <Labelled label="Targets">
            <div className="flex flex-wrap gap-3 py-1.5">
              {actorItems.map((actor) => {
                const checked = action.targetIds.includes(actor.value);
                return (
                  <label
                    key={actor.value}
                    className="flex items-center gap-1.5 text-sm text-foreground"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      // At least one target, as the schema requires.
                      disabled={checked && action.targetIds.length === 1}
                      onChange={() =>
                        onChange({
                          ...action,
                          targetIds: checked
                            ? action.targetIds.filter((id) => id !== actor.value)
                            : [...action.targetIds, actor.value],
                        })
                      }
                    />
                    {actor.label}
                  </label>
                );
              })}
            </div>
          </Labelled>
        </>
      )}

      {(action?.type === 'check' || action?.type === 'save') && (
        <>
          <Labelled label="Ability">
            <Select
              value={action.ability}
              onValueChange={(ability) => ability !== null && onChange({ ...action, ability })}
            >
              <SelectTrigger aria-label={`${label} ability`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ABILITIES.map((ability) => (
                  <SelectItem key={ability} value={ability}>
                    {ability.toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Labelled>
          {action.type === 'check' && (
            <Labelled label="Skill">
              <Input
                value={action.skill ?? ''}
                placeholder="none"
                aria-label={`${label} skill`}
                className="w-32"
                onChange={(event) =>
                  onChange({ ...action, skill: event.target.value.trim() || null })
                }
              />
            </Labelled>
          )}
          <IntField label="DC" value={action.dc} onChange={(dc) => onChange({ ...action, dc })} />
        </>
      )}
    </div>
  );
}

function WeaponSelect({
  label,
  situation,
  value,
  onChange,
}: {
  label: string;
  situation: Situation;
  value: string | null;
  onChange: (weapon: string | null) => void;
}) {
  const items = [
    { value: NONE, label: 'Unarmed' },
    ...Object.values(situation.items).map((item) => ({ value: item.slug, label: item.name })),
  ];
  return (
    <Labelled label="Weapon">
      <Select
        items={items}
        value={value ?? NONE}
        onValueChange={(next) => onChange(next === NONE || next === null ? null : next)}
      >
        <SelectTrigger aria-label={`${label} weapon`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Labelled>
  );
}
