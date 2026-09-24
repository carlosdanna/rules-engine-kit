'use client';

/**
 * "Rules" and "Diff" on a ruleset version page (VR-9). The selected tab and the version the
 * diff is taken against are both in the URL, so a diff is a link. Both panels are rendered on
 * the server and passed in; this only switches between them and keeps the URL in step.
 */

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export type VersionTabsProps = {
  tab: 'rules' | 'diff';
  against: string | null;
  candidates: string[];
  rules: React.ReactNode;
  diff: React.ReactNode;
};

export function VersionTabs({ tab, against, candidates, rules, diff }: VersionTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function navigate(changes: Record<string, string | null>): void {
    const query = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) query.delete(key);
      else query.set(key, value);
    }
    router.replace(`${pathname}?${query.toString()}`, { scroll: false });
  }

  return (
    <Tabs
      value={tab}
      onValueChange={(next) => navigate({ tab: next === 'diff' ? 'diff' : null, rule: null })}
    >
      <TabsList>
        <TabsTrigger value="rules">Rules</TabsTrigger>
        <TabsTrigger value="diff">Diff</TabsTrigger>
      </TabsList>

      <TabsContent value="rules" className="pt-3">
        {rules}
      </TabsContent>

      <TabsContent value="diff" className="space-y-4 pt-3">
        <Field className="max-w-xs">
          <FieldLabel>Compared against</FieldLabel>
          <Select
            value={against ?? ''}
            onValueChange={(next) => next !== null && navigate({ tab: 'diff', against: next })}
          >
            <SelectTrigger aria-label="Compared against" className="w-full">
              <SelectValue placeholder="Choose a version" />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((id) => (
                <SelectItem key={id} value={id}>
                  <span className="font-mono text-xs">{id}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {diff}
      </TabsContent>
    </Tabs>
  );
}
