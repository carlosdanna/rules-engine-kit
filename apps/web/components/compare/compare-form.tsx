'use client';

/**
 * The comparison's inputs, which live in the URL (ADR-0031): choosing them navigates to
 * `/compare?scenario=…&a=…&b=…&seed=…` and the server runs both sides. A comparison is
 * therefore a link, and nothing about it is stored.
 */

import { usePathname, useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type CompareInputs = { scenario: string; a: string; b: string; seed: string };

export type CompareFormProps = {
  scenarios: { id: string; name: string }[];
  profiles: { id: string; name: string }[];
  initial: CompareInputs;
};

function Picker({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: { id: string; name: string }[];
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select
        value={value}
        onValueChange={(next) => onChange(next ?? value)}
        items={options.map((option) => ({ value: option.id, label: option.name }))}
      >
        <SelectTrigger aria-label={label} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

export function CompareForm({ scenarios, profiles, initial }: CompareFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [inputs, setInputs] = useState(initial);
  const [pending, startTransition] = useTransition();
  const set = (field: keyof CompareInputs) => (value: string) =>
    setInputs((current) => ({ ...current, [field]: value }));

  return (
    <form
      className="grid items-end gap-4 sm:grid-cols-[2fr_1fr_auto_1fr_1fr_auto]"
      onSubmit={(event) => {
        event.preventDefault();
        const query = new URLSearchParams({ ...inputs, seed: inputs.seed.trim() });
        startTransition(() => router.push(`${pathname}?${query.toString()}`));
      }}
    >
      <Picker
        label="Scenario"
        value={inputs.scenario}
        onChange={set('scenario')}
        options={scenarios}
      />
      <Picker label="Profile A" value={inputs.a} onChange={set('a')} options={profiles} />
      <Button
        type="button"
        variant="ghost"
        aria-label="Swap profiles"
        onClick={() => setInputs((current) => ({ ...current, a: current.b, b: current.a }))}
      >
        ⇄
      </Button>
      <Picker label="Profile B" value={inputs.b} onChange={set('b')} options={profiles} />
      <Field>
        <FieldLabel htmlFor="compare-seed">Seed</FieldLabel>
        <Input
          id="compare-seed"
          value={inputs.seed}
          onChange={(event) => set('seed')(event.target.value)}
          className="font-mono"
        />
      </Field>
      <Button type="submit" disabled={pending || inputs.seed.trim() === ''}>
        {pending ? 'Comparing…' : 'Compare'}
      </Button>
    </form>
  );
}
