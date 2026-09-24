'use client';

/**
 * One control per template param type (FR-19).
 *
 * The vocabulary is closed — `docs/content-authoring.md` says anything more complex is edited
 * in the JSON tab — so this is a total function over six cases rather than a registry with a
 * fallback. That is the promise FR-19 makes: a template declares typed params, and the form
 * follows without guessing.
 *
 * Every control emits the param's *declared* type. `resolveParams` checks without coercing, so
 * a number input that handed back `"5"` would be rejected on save with a message about a string
 * — which is why the conversion happens here, at the one place that knows what the param is.
 */

import type { TemplateParam } from '@rules-engine-kit/engine';
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from '@/components/ui/combobox';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

/** A fixture the picker may offer: resolved for the chosen profile by the caller (ADR-0026). */
export type FixtureChoice = { slug: string; name: string; kind: 'actor' | 'item' };

export type ParamControlProps = {
  name: string;
  param: TemplateParam;
  value: unknown;
  onChange: (value: unknown) => void;
  /** Already filtered to the chosen profile and to the param's declared kind. */
  fixtures: FixtureChoice[];
  /** Suggestions only — a `conditionList` takes free text (see `conditionNames`). */
  conditions: string[];
  error?: string | string[] | undefined;
};

const asArray = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);

/** Prose for the constraint the param declares, so the form states it before the save does. */
function describe(param: TemplateParam): string | null {
  switch (param.type) {
    case 'number': {
      const bounds = [
        param.min === undefined ? null : `at least ${param.min}`,
        param.max === undefined ? null : `at most ${param.max}`,
      ].filter((bound) => bound !== null);
      return bounds.length === 0 ? null : bounds.join(', ');
    }
    case 'fixture':
      return `a seeded ${param.kind}, resolved for the chosen profile`;
    case 'rollChoice':
      return `which die a reroll of the ${param.roll} roll touches, counting from zero`;
    case 'conditionList':
      return 'names as the rules read them; type to add one that is not listed';
    default:
      return null;
  }
}

export function ParamControl({
  name,
  param,
  value,
  onChange,
  fixtures,
  conditions,
  error,
}: ParamControlProps) {
  const description = describe(param);

  return (
    <Field name={`params.${name}`} data-invalid={error === undefined ? undefined : true}>
      <FieldLabel className="font-mono text-xs">{name}</FieldLabel>

      {param.type === 'boolean' && (
        <Switch
          checked={value === true}
          onCheckedChange={(checked) => onChange(checked)}
          aria-label={name}
        />
      )}

      {param.type === 'number' && (
        <Input
          type="number"
          inputMode="decimal"
          value={typeof value === 'number' ? String(value) : ''}
          min={param.min}
          max={param.max}
          aria-label={name}
          // An empty field is not zero; it is "nothing typed yet", and `resolveParams` will
          // fall back to the declared default for a param the form never sends.
          onChange={(event) => {
            const raw = event.target.value;
            onChange(raw === '' ? undefined : Number(raw));
          }}
        />
      )}

      {param.type === 'rollChoice' && (
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={typeof value === 'number' ? String(value) : ''}
          aria-label={name}
          onChange={(event) => {
            const raw = event.target.value;
            onChange(raw === '' ? undefined : Number.parseInt(raw, 10));
          }}
        />
      )}

      {param.type === 'enum' && (
        <Select
          value={typeof value === 'string' ? value : param.default}
          onValueChange={(next) => onChange(next ?? param.default)}
        >
          <SelectTrigger aria-label={name}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {param.values.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {param.type === 'fixture' && (
        <FixturePicker
          name={name}
          value={typeof value === 'string' ? value : param.default}
          fixtures={fixtures}
          onChange={onChange}
        />
      )}

      {param.type === 'conditionList' && (
        <ConditionPicker
          name={name}
          value={asArray(value)}
          suggestions={conditions}
          onChange={onChange}
        />
      )}

      {description !== null && <FieldDescription>{description}</FieldDescription>}
      {error !== undefined && (
        <FieldError>{Array.isArray(error) ? error.join('; ') : error}</FieldError>
      )}
    </Field>
  );
}

/**
 * A slug picker, not a fixture picker: what is stored in `params` is the slug, and which stat
 * block it resolves to is the profile's business (ADR-0026). The name is shown because
 * `goblin` under two editions is two different creatures with one slug.
 */
function FixturePicker({
  name,
  value,
  fixtures,
  onChange,
}: {
  name: string;
  value: string;
  fixtures: FixtureChoice[];
  onChange: (value: unknown) => void;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next ?? value)}>
      <SelectTrigger aria-label={name}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {fixtures.length === 0 && (
          <SelectItem value={value} disabled>
            nothing seeded under this profile
          </SelectItem>
        )}
        {fixtures.map((fixture) => (
          <SelectItem key={fixture.slug} value={fixture.slug}>
            <span className="font-mono text-xs">{fixture.slug}</span>
            <span className="text-muted-foreground"> — {fixture.name}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Multi-select over the conditions the seeded rules mention, but open: nothing in the repo
 * enumerates conditions, so the list is harvested from rule keys and a house rule may name one
 * no seeded rule does. The scenario form reuses it for damage types, hence `noun`.
 */
export function ConditionPicker({
  name,
  value,
  suggestions,
  onChange,
  noun = 'condition',
}: {
  name: string;
  value: string[];
  suggestions: string[];
  onChange: (value: string[]) => void;
  noun?: string;
}) {
  const anchor = useComboboxAnchor();
  const offered = [...new Set([...suggestions, ...value])].sort();

  return (
    <Combobox
      multiple
      items={offered}
      value={value}
      onValueChange={(next) => onChange(next as string[])}
    >
      <ComboboxChips ref={anchor}>
        <ComboboxValue>
          {(selected: string[]) => (
            <>
              {selected.map((condition) => (
                <ComboboxChip key={condition}>{condition}</ComboboxChip>
              ))}
              <ComboboxChipsInput
                aria-label={name}
                placeholder={selected.length === 0 ? 'none' : ''}
              />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>

      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>no matching {noun}</ComboboxEmpty>
        <ComboboxList>
          {(condition: string) => (
            <ComboboxItem key={condition} value={condition}>
              {condition}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
