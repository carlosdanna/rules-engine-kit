'use client';

/**
 * Creating and editing a scenario (FR-18, FR-19).
 *
 * The one stateful component on `/scenarios/new` and `/scenarios/[slug]/edit`. Both routes
 * render it; only the loader above them differs, which is why duplicate is not a third mode —
 * the server resolves `?from=` into the same seed an edit produces.
 *
 * **The preview renders in the browser.** `renderTemplate` is pure and the engine is
 * browser-safe by construction (`packages/engine/test/purity.test.ts`), which is what NFR-3
 * has always promised and this is the first route to cash in. The alternative — a server
 * action per keystroke — is worse than it sounds: Next dispatches actions one at a time per
 * client, so five characters would queue behind each other. The save re-renders server-side
 * from freshly-read rows regardless, so nothing here is trusted; this is a preview.
 *
 * **Canonical state differs by mode, deliberately.** In template mode the params are canonical
 * and the situation is derived, so there is nothing to keep in sync. In literal mode the raw
 * *text* is canonical, because a JSON editor has to tolerate a half-typed brace — deriving the
 * text from a parsed `Situation` would fight the person typing.
 */

import type { TemplateRow } from '@rules-engine-kit/db';
import {
  buildFixtureIndex,
  type Fixture,
  renderTemplate,
  type Situation,
  Situation as SituationSchema,
  type Template,
  TemplateRenderError,
} from '@rules-engine-kit/engine';
import { useActionState, useDeferredValue, useMemo, useState, useTransition } from 'react';
import { createScenarioAction, updateScenarioAction } from '@/app/scenarios/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import type { ActionResult, SavedScenario } from '@/lib/scenarios/types';
import { slugifyInBrowser } from '@/lib/slugify-browser';
import { type FixtureChoice, ParamControl } from './param-controls';
import { SituationForm } from './situation-form';

export type EditorSeed =
  | { mode: 'template'; templateId: string; params: Record<string, unknown> }
  | { mode: 'literal'; situation: Situation };

export type ScenarioEditorProps = {
  /** `null` when creating; the slug being edited otherwise. */
  editing: string | null;
  initialName: string;
  initialSlug: string;
  seed: EditorSeed;
  template: TemplateRow | null;
  fixtures: Fixture[];
  profiles: string[];
  conditions: string[];
  /** Set when a stored row's params no longer fit its template, so the link was dropped. */
  drifted?: boolean;
};

/** A `TemplateRow` is a `Template` plus the columns the database needs to address it. */
function toTemplate(row: TemplateRow): Template {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    tags: row.tags,
    schemaVersion: row.schemaVersion as Template['schemaVersion'],
    suggestedProfiles: row.suggestedProfiles,
    params: row.paramsSchema,
    skeleton: row.skeleton,
  };
}

export function ScenarioEditor({
  editing,
  initialName,
  initialSlug,
  seed,
  template,
  fixtures,
  profiles,
  conditions,
  drifted = false,
}: ScenarioEditorProps) {
  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState(initialSlug);
  /** Once the slug is touched it stops following the name: it is a key, not a caption. */
  const [slugPinned, setSlugPinned] = useState(editing !== null);

  const [params, setParams] = useState<Record<string, unknown>>(
    seed.mode === 'template' ? seed.params : {},
  );
  const [text, setText] = useState(() =>
    seed.mode === 'literal' ? JSON.stringify(seed.situation, null, 2) : '',
  );
  const [profile, setProfile] = useState(
    template?.suggestedProfiles[0] ?? profiles[0] ?? 'srd-5.1',
  );

  const [pending, startTransition] = useTransition();
  const [result, submit] = useActionState<ActionResult<SavedScenario> | null, unknown>(
    editing === null
      ? createScenarioAction
      : (previous, payload) => updateScenarioAction(previous, { slug: editing, input: payload }),
    null,
  );

  const fieldErrors = result !== null && !result.ok ? result.fieldErrors : {};
  const formErrors = result !== null && !result.ok ? result.formErrors : [];

  const index = useMemo(() => buildFixtureIndex(fixtures), [fixtures]);

  /** The preview: a pure function of the form, so there is no sync to get wrong. */
  const rendered = useMemo(() => {
    if (seed.mode !== 'template' || template === null) return null;
    try {
      return {
        ok: true as const,
        situation: renderTemplate(toTemplate(template), params, index, profile),
      };
    } catch (thrown) {
      if (thrown instanceof TemplateRenderError) {
        return { ok: false as const, path: thrown.path, message: thrown.message };
      }
      throw thrown;
    }
  }, [seed.mode, template, params, index, profile]);

  /** Deferred, so a long situation does not re-parse on the keystroke that typed it. */
  const deferredText = useDeferredValue(text);
  const parsed = useMemo(() => {
    if (seed.mode !== 'literal') return null;
    let json: unknown;
    try {
      json = JSON.parse(deferredText);
    } catch (thrown) {
      return { stage: 'syntax' as const, issues: [(thrown as Error).message] };
    }
    const check = SituationSchema.safeParse(json);
    return check.success
      ? { stage: 'ok' as const, situation: check.data }
      : {
          stage: 'schema' as const,
          issues: check.error.issues.map(
            (issue) => `${issue.path.join('.') || '<root>'} — ${issue.message}`,
          ),
        };
  }, [seed.mode, deferredText]);

  const fixturesOfKind = (kind: 'actor' | 'item'): FixtureChoice[] =>
    fixtures
      .filter((fixture) => fixture.kind === kind && fixture.rulesetScope.includes(profile))
      .map((fixture) => ({ slug: fixture.slug, name: fixture.data.name, kind }));

  function onSubmit(): void {
    const body =
      seed.mode === 'template' && template !== null
        ? { kind: 'template' as const, templateId: template.id, profile, params }
        : { kind: 'literal' as const, situation: parsed?.stage === 'ok' ? parsed.situation : null };

    startTransition(() => submit({ slug, name, body }));
  }

  const blocked = seed.mode === 'literal' ? parsed?.stage !== 'ok' : rendered?.ok !== true;

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {drifted && (
        <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
          This scenario's template no longer declares the params it was saved with, so it is being
          edited as a literal situation. Its stored situation is unaffected — a situation is closed
          over its content (ADR-0017) — but saving will drop the template link.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="name">
          <FieldLabel>Name</FieldLabel>
          <Input
            value={name}
            aria-label="Name"
            onChange={(event) => {
              setName(event.target.value);
              if (!slugPinned) setSlug(slugifyInBrowser(event.target.value));
            }}
          />
          {fieldErrors.name !== undefined && <FieldError>{fieldErrors.name}</FieldError>}
        </Field>

        <Field name="slug">
          <FieldLabel>Slug</FieldLabel>
          <Input
            value={slug}
            aria-label="Slug"
            className="font-mono text-xs"
            onChange={(event) => {
              setSlugPinned(true);
              setSlug(event.target.value);
            }}
            disabled={editing !== null}
          />
          <FieldDescription>
            {editing === null
              ? 'The row’s primary key and its exported filename (ADR-0027).'
              : 'A slug is never renamed in place — duplicate the scenario instead.'}
          </FieldDescription>
          {fieldErrors.slug !== undefined && <FieldError>{fieldErrors.slug}</FieldError>}
        </Field>
      </div>

      {seed.mode === 'template' && template !== null ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-4">
            <header className="space-y-1">
              <h2 className="font-medium">{template.name}</h2>
              <p className="text-sm text-muted-foreground">{template.description}</p>
            </header>

            <Field name="profile">
              <FieldLabel>Rendered against</FieldLabel>
              <Select value={profile} onValueChange={(next) => setProfile(next ?? profile)}>
                <SelectTrigger aria-label="Rendered against">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(template.suggestedProfiles.length > 0
                    ? template.suggestedProfiles
                    : profiles
                  ).map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                A render input, not a stored column: which profile it is <em>run</em> under is
                chosen every time (ADR-0028).
              </FieldDescription>
            </Field>

            {Object.entries(template.paramsSchema).map(([paramName, param]) => (
              <ParamControl
                key={paramName}
                name={paramName}
                param={param}
                value={params[paramName] ?? param.default}
                onChange={(value) => setParams((current) => ({ ...current, [paramName]: value }))}
                fixtures={param.type === 'fixture' ? fixturesOfKind(param.kind) : []}
                conditions={conditions}
                error={fieldErrors[`params.${paramName}`]}
              />
            ))}
          </section>

          <section className="space-y-2">
            <h2 className="font-medium">Situation</h2>
            <SituationPreview rendered={rendered} />
          </section>
        </div>
      ) : (
        <Tabs defaultValue="form">
          <TabsList>
            <TabsTrigger value="form">Form</TabsTrigger>
            <TabsTrigger value="json">JSON</TabsTrigger>
          </TabsList>

          {/* Both panels stay mounted, so switching tabs keeps the textarea's caret and scroll. */}
          <TabsContent value="form" keepMounted className="space-y-4 pt-2">
            {parsed?.stage === 'ok' ? (
              <SituationForm
                situation={parsed.situation}
                onChange={(next) => setText(JSON.stringify(next, null, 2))}
              />
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Fix the JSON to use the form view.</p>
                <IssueList parsed={parsed} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="json" keepMounted className="space-y-2 pt-2">
            <Textarea
              value={text}
              aria-label="Situation JSON"
              spellCheck={false}
              className="min-h-[28rem] font-mono text-xs"
              onChange={(event) => setText(event.target.value)}
            />
            <IssueList parsed={parsed} />
          </TabsContent>
        </Tabs>
      )}

      {formErrors.length > 0 && (
        <ul className="space-y-1 text-sm text-destructive">
          {formErrors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending || blocked}>
          {pending ? 'Saving…' : editing === null ? 'Save scenario' : 'Save changes'}
        </Button>
        {blocked && (
          <span className="text-sm text-muted-foreground">Fix the errors above to save.</span>
        )}
      </div>
    </form>
  );
}

/** Keeps the last good render visible while an intermediate keystroke is invalid. */
function SituationPreview({
  rendered,
}: {
  rendered:
    | { ok: true; situation: Situation }
    | { ok: false; path: string; message: string }
    | null;
}) {
  if (rendered === null) return null;

  if (!rendered.ok) {
    return (
      <div className="space-y-2">
        <Badge variant="outline" className="font-mono text-xs">
          {rendered.path}
        </Badge>
        <p className="text-sm text-destructive">{rendered.message}</p>
      </div>
    );
  }

  return (
    <pre className="max-h-[32rem] overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs">
      {JSON.stringify(rendered.situation, null, 2)}
    </pre>
  );
}

type Parsed =
  | { stage: 'ok'; situation: Situation }
  | { stage: 'syntax' | 'schema'; issues: string[] }
  | null;

function IssueList({ parsed }: { parsed: Parsed }) {
  if (parsed === null || parsed.stage === 'ok') {
    return <p className="text-sm text-muted-foreground">Valid against the situation schema.</p>;
  }

  return (
    <ul className="space-y-1 text-sm text-destructive">
      {parsed.issues.map((issue) => (
        <li key={issue} className="font-mono text-xs">
          {issue}
        </li>
      ))}
    </ul>
  );
}
