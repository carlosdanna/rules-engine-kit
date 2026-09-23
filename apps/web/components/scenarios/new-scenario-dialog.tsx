'use client';

/**
 * "New scenario" — the three ways FR-18 says one is made.
 *
 * The chosen mode is local state rather than a searchParam: it is a step in a wizard that
 * closes without navigating, which is the same call `rules-explorer.tsx` makes about its
 * filters. What the dialog produces is a link into `/scenarios/new`, where the mode *is* in
 * the URL, because at that point it decides what the page loads.
 *
 * The template search is the existing `Combobox`. Base UI has no command primitive and there
 * is no `cmdk` in the tree — base-nova builds palette search out of `Combobox`, and
 * `rules-explorer.tsx` is the precedent in this repo.
 */

import type { ScenarioRow, TemplateRow } from '@rules-engine-kit/db';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export type NewScenarioDialogProps = {
  templates: Pick<TemplateRow, 'id' | 'name' | 'description'>[];
  scenarios: Pick<ScenarioRow, 'id' | 'name' | 'origin'>[];
};

export function NewScenarioDialog({ templates, scenarios }: NewScenarioDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);

  function go(href: string): void {
    setOpen(false);
    router.push(href);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>New scenario</Button>} />

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New scenario</DialogTitle>
          <DialogDescription>
            Start from nothing, fill in a template’s params, or copy one you already have.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="template">
          <TabsList>
            <TabsTrigger value="template">From a template</TabsTrigger>
            <TabsTrigger value="blank">Blank slate</TabsTrigger>
            <TabsTrigger value="duplicate">Duplicate</TabsTrigger>
          </TabsList>

          <TabsContent value="template" className="space-y-3 pt-3">
            <Combobox
              items={templates}
              itemToStringLabel={(item: NewScenarioDialogProps['templates'][number]) => item.name}
              value={templates.find((item) => item.id === template) ?? null}
              onValueChange={(item: NewScenarioDialogProps['templates'][number] | null) =>
                setTemplate(item?.id ?? null)
              }
            >
              <ComboboxInput placeholder="Search templates…" aria-label="Search templates" />
              <ComboboxContent>
                <ComboboxEmpty>no matching template</ComboboxEmpty>
                <ComboboxList>
                  {(item: NewScenarioDialogProps['templates'][number]) => (
                    <ComboboxItem key={item.id} value={item}>
                      <span className="flex flex-col gap-0.5">
                        <span>{item.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">{item.id}</span>
                      </span>
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>

            <DialogFooter>
              <Button
                disabled={template === null}
                onClick={() =>
                  template !== null && go(`/scenarios/new?template=${encodeURIComponent(template)}`)
                }
              >
                Fill in its params
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="blank" className="space-y-3 pt-3">
            <p className="text-sm text-muted-foreground">
              One actor, one turn, no action — the smallest thing that parses. Edit it as a form or
              as JSON.
            </p>
            <DialogFooter>
              <Button onClick={() => go('/scenarios/new')}>Start from blank</Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="duplicate" className="space-y-3 pt-3">
            <Combobox
              items={scenarios}
              itemToStringLabel={(item: NewScenarioDialogProps['scenarios'][number]) => item.name}
              value={scenarios.find((item) => item.id === source) ?? null}
              onValueChange={(item: NewScenarioDialogProps['scenarios'][number] | null) =>
                setSource(item?.id ?? null)
              }
            >
              <ComboboxInput placeholder="Search scenarios…" aria-label="Search scenarios" />
              <ComboboxContent>
                <ComboboxEmpty>no matching scenario</ComboboxEmpty>
                <ComboboxList>
                  {(item: NewScenarioDialogProps['scenarios'][number]) => (
                    <ComboboxItem key={item.id} value={item}>
                      <span className="flex flex-col gap-0.5">
                        <span>{item.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">{item.id}</span>
                      </span>
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
            <p className="text-sm text-muted-foreground">
              A copy keeps the template and params behind it, so a fixture correction can still be
              taken up by re-rendering (ADR-0017).
            </p>

            <DialogFooter>
              <Button
                disabled={source === null}
                onClick={() =>
                  source !== null && go(`/scenarios/new?from=${encodeURIComponent(source)}`)
                }
              >
                Duplicate it
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
