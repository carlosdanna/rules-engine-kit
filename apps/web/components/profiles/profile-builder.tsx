'use client';

/**
 * Build a profile by ordering ruleset versions (FR-2, ADR-0031): add versions, drag them into
 * order — base first (ADR-0018) — and watch what `resolveProfile` makes of the stack.
 *
 * The preview is a server round trip: the packs are rows, and `packages/db` does not reach the
 * browser. Only the newest request's answer is shown, so a slow preview cannot overwrite a
 * faster one for a later stack. Save is refused only for a stack that cannot resolve; one with
 * conflicts saves, and says so.
 *
 * Sorting is `@dnd-kit/sortable` with its keyboard sensor, so the order can be changed without
 * a pointer: focus a handle, Space to lift, arrows to move, Space to drop.
 */

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVerticalIcon, PlusIcon, XIcon } from 'lucide-react';
import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { createProfileAction, previewProfileAction } from '@/app/profiles/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { ProfileInput, ProfilePreview } from '@/lib/profiles/write';
import type { VersionOption } from '@/lib/queries';
import type { ActionResult } from '@/lib/scenarios/types';
import { slugifyInBrowser } from '@/lib/slugify-browser';
import { ResolutionReport } from './resolution-report';

function StackItem({
  version,
  position,
  onRemove,
}: {
  version: VersionOption;
  position: number;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: version.id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm ${isDragging ? 'z-10 shadow-md' : ''}`}
      data-testid="stack-item"
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label={`Reorder ${version.id}`}
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon className="size-4" />
      </button>
      <span className="w-14 text-xs text-muted-foreground">
        {position === 0 ? 'base' : `layer ${position}`}
      </span>
      <span className="font-mono text-xs">{version.id}</span>
      <Badge variant={version.kind === 'layer' ? 'default' : 'secondary'}>{version.kind}</Badge>
      <span className="truncate text-xs text-muted-foreground">{version.name}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="ml-auto"
        aria-label={`Remove ${version.id}`}
        onClick={onRemove}
      >
        <XIcon />
      </Button>
    </li>
  );
}

export function ProfileBuilder({ versions }: { versions: VersionOption[] }) {
  const byId = new Map(versions.map((version) => [version.id, version]));
  const firstBase = versions.find((version) => version.kind === 'base');

  const [stack, setStack] = useState<string[]>(firstBase === undefined ? [] : [firstBase.id]);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugPinned, setSlugPinned] = useState(false);

  const [preview, setPreview] = useState<ActionResult<ProfilePreview> | null>(null);
  const latest = useRef(0);
  useEffect(() => {
    const request = ++latest.current;
    previewProfileAction(stack).then((answer) => {
      if (request === latest.current) setPreview(answer);
    });
  }, [stack]);

  const [saving, startSaving] = useTransition();
  const [saved, save] = useActionState<ActionResult<{ slug: string }> | null, ProfileInput>(
    createProfileAction,
    null,
  );
  const fieldErrors = saved !== null && !saved.ok ? saved.fieldErrors : {};
  const formErrors = saved !== null && !saved.ok ? saved.formErrors : [];
  const errorsFor = (field: string) =>
    [fieldErrors[field] ?? []].flat().map((message) => ({ message }));

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd({ active, over }: DragEndEvent): void {
    if (over === null || active.id === over.id) return;
    setStack((current) =>
      arrayMove(current, current.indexOf(String(active.id)), current.indexOf(String(over.id))),
    );
  }

  const incompatible = preview?.ok === true && preview.data.status === 'incompatible';

  return (
    <Card>
      <CardHeader>
        <CardTitle>New profile</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            startSaving(() => save({ name, slug, versionIds: stack }));
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="profile-name">Name</FieldLabel>
              <Input
                id="profile-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (!slugPinned) setSlug(slugifyInBrowser(event.target.value, 'profile'));
                }}
              />
              <FieldError errors={errorsFor('name')} />
            </Field>
            <Field>
              <FieldLabel htmlFor="profile-slug">Slug</FieldLabel>
              <Input
                id="profile-slug"
                value={slug}
                className="font-mono text-xs"
                onChange={(event) => {
                  setSlugPinned(true);
                  setSlug(event.target.value);
                }}
              />
              <FieldError errors={errorsFor('slug')} />
            </Field>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
            <section className="space-y-2" aria-label="Available versions">
              <h3 className="text-sm font-medium">Ruleset versions</h3>
              <ul className="space-y-1">
                {versions.map((version) => (
                  <li key={version.id} className="flex items-center gap-2 text-sm">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-xs"
                      aria-label={`Add ${version.id}`}
                      disabled={stack.includes(version.id)}
                      onClick={() => setStack((current) => [...current, version.id])}
                    >
                      <PlusIcon />
                    </Button>
                    <span className="font-mono text-xs">{version.id}</span>
                    <Badge variant={version.kind === 'layer' ? 'default' : 'secondary'}>
                      {version.kind}
                    </Badge>
                  </li>
                ))}
              </ul>
            </section>

            <section className="space-y-2" aria-label="Stack">
              <h3 className="text-sm font-medium">
                Stack{' '}
                <span className="font-normal text-muted-foreground">
                  — base first; drag to reorder
                </span>
              </h3>
              {stack.length === 0 ? (
                <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
                  Empty. Add a base version to start.
                </p>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={onDragEnd}
                >
                  <SortableContext items={stack} strategy={verticalListSortingStrategy}>
                    <ol className="space-y-1">
                      {stack.map((id, position) => {
                        const version = byId.get(id);
                        return version === undefined ? null : (
                          <StackItem
                            key={id}
                            version={version}
                            position={position}
                            onRemove={() => setStack((current) => current.filter((v) => v !== id))}
                          />
                        );
                      })}
                    </ol>
                  </SortableContext>
                </DndContext>
              )}
              <FieldError errors={errorsFor('layers')} />
            </section>
          </div>

          <section className="space-y-2" aria-label="Resolution" aria-live="polite">
            <h3 className="text-sm font-medium">Resolution</h3>
            {preview === null ? (
              <p className="text-sm text-muted-foreground">Resolving…</p>
            ) : preview.ok ? (
              <ResolutionReport preview={preview.data} />
            ) : (
              <p className="text-sm text-destructive">{preview.formErrors.join(' ')}</p>
            )}
          </section>

          {formErrors.length > 0 && (
            <p className="text-sm text-destructive">{formErrors.join(' ')}</p>
          )}
          {saved?.ok === true && (
            <p className="text-sm" role="status">
              Saved as <span className="font-mono">{saved.data.slug}</span>. It is listed below and
              can be chosen on /playground and /compare.
            </p>
          )}

          <Button type="submit" disabled={saving || incompatible || stack.length === 0}>
            {saving ? 'Saving…' : 'Save profile'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
