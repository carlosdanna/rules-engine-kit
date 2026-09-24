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
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
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
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/** An actor fixture the guided blank slate can start from; one entry per edition variant. */
export type StarterActor = { slug: string; name: string; rulesetScope: string[] };

export type NewScenarioDialogProps = {
  templates: Pick<TemplateRow, 'id' | 'name' | 'description'>[];
  scenarios: Pick<ScenarioRow, 'id' | 'name' | 'origin'>[];
  /** Profiles some actor fixture is scoped to. */
  profiles: string[];
  actors: StarterActor[];
};

export function NewScenarioDialog({
  templates,
  scenarios,
  profiles,
  actors,
}: NewScenarioDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);

  const [profile, setProfile] = useState(profiles[0] ?? null);
  const [picked, setPicked] = useState<string[]>([]);
  const [attack, setAttack] = useState(true);
  const anchor = useComboboxAnchor();
  const attackId = useId();
  const offered = actors.filter(
    (actor) => profile !== null && actor.rulesetScope.includes(profile),
  );
  const nameOf = (slug: string): string =>
    offered.find((actor) => actor.slug === slug)?.name ?? slug;

  function startBlank(): void {
    const query = new URLSearchParams();
    if (profile !== null) query.set('profile', profile);
    if (picked.length > 0) query.set('actors', picked.join(','));
    if (picked.length > 1 && attack) query.set('action', 'attack');
    const search = query.toString();
    go(search === '' ? '/scenarios/new' : `/scenarios/new?${search}`);
  }

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

          <TabsContent value="blank" className="space-y-4 pt-3">
            <p className="text-sm text-muted-foreground">
              Pick who is in it and you land in the form with their stat blocks filled in; add
              weapons, actions and more steps there. Pick nobody for a single blank actor.
            </p>

            <Field name="starterProfile">
              <FieldLabel>Stat blocks from</FieldLabel>
              <Select
                value={profile}
                onValueChange={(next) => {
                  setProfile(next);
                  // A slug scoped only to the other edition would not resolve under this one.
                  setPicked((current) =>
                    current.filter((slug) =>
                      actors.some(
                        (actor) =>
                          actor.slug === slug && next !== null && actor.rulesetScope.includes(next),
                      ),
                    ),
                  );
                }}
              >
                <SelectTrigger aria-label="Stat blocks from">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                Which edition's variant each creature is copied from. Not stored; you still pick a
                profile every time you run it.
              </FieldDescription>
            </Field>

            <Field name="starterActors">
              <FieldLabel>Actors, in turn order</FieldLabel>
              <Combobox
                multiple
                items={offered.map((actor) => actor.slug)}
                itemToStringLabel={nameOf}
                value={picked}
                onValueChange={(next) => setPicked(next as string[])}
              >
                <ComboboxChips ref={anchor}>
                  <ComboboxValue>
                    {(selected: string[]) => (
                      <>
                        {selected.map((slug) => (
                          <ComboboxChip key={slug}>{nameOf(slug)}</ComboboxChip>
                        ))}
                        <ComboboxChipsInput
                          aria-label="Actors"
                          placeholder={selected.length === 0 ? 'Search stat blocks…' : ''}
                        />
                      </>
                    )}
                  </ComboboxValue>
                </ComboboxChips>
                <ComboboxContent anchor={anchor}>
                  <ComboboxEmpty>no matching stat block</ComboboxEmpty>
                  <ComboboxList>
                    {(slug: string) => (
                      <ComboboxItem key={slug} value={slug}>
                        <span className="flex flex-col gap-0.5">
                          <span>{nameOf(slug)}</span>
                          <span className="font-mono text-xs text-muted-foreground">{slug}</span>
                        </span>
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </Field>

            <div className="flex items-center gap-2 text-sm">
              <Switch
                id={attackId}
                checked={picked.length > 1 && attack}
                disabled={picked.length < 2}
                onCheckedChange={setAttack}
              />
              <label htmlFor={attackId}>The first actor attacks the second</label>
            </div>

            <DialogFooter>
              <Button onClick={startBlank}>Start from blank</Button>
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
