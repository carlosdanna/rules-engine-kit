import { slugify, uniqueSlug } from '@rules-engine-kit/db';
import { blankSituation } from '@rules-engine-kit/engine';
import { notFound } from 'next/navigation';
import { type EditorSeed, ScenarioEditor } from '@/components/scenarios/scenario-editor';
import {
  conditionNames,
  getScenario,
  getTemplate,
  listFixtures,
  listProfiles,
  takenScenarioIds,
} from '@/lib/queries';
import { editorSeedFor } from '@/lib/scenarios/write';

export const metadata = { title: 'New scenario' };
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/**
 * All three ways FR-18 makes a scenario, resolved here rather than in the browser.
 *
 * Duplicate is not a third editor: `?from=` is read into the same seed an edit produces, which
 * is what keeps "a copy stays re-renderable" (ADR-0029) a property of one code path. Which of
 * the two editors the seed opens is `editorSeedFor`'s decision, including the drift case where
 * a stored row's params no longer fit its template.
 */
export default async function NewScenarioPage({ searchParams }: PageProps<'/scenarios/new'>) {
  const params = await searchParams;
  const wantedTemplate = first(params.template);
  const duplicateOf = first(params.from);

  const [fixtures, profiles, conditions, taken] = await Promise.all([
    listFixtures(),
    listProfiles(),
    conditionNames(),
    takenScenarioIds(),
  ]);

  const shared = {
    fixtures,
    profiles: profiles.map((profile) => profile.id),
    conditions,
    editing: null,
  };

  if (duplicateOf !== undefined) {
    const row = await getScenario(duplicateOf);
    if (row === null) notFound();

    const template = row.templateId === null ? null : await getTemplate(row.templateId);
    const source = editorSeedFor(row, template);
    const name = `${row.name} (copy)`;

    const seed: EditorSeed =
      source.mode === 'template'
        ? { mode: 'template', templateId: source.templateId, params: source.params }
        : { mode: 'literal', situation: source.situation };

    return (
      <NewScenarioLayout title={`Duplicate “${row.name}”`}>
        <ScenarioEditor
          {...shared}
          initialName={name}
          initialSlug={uniqueSlug(slugify(name), taken)}
          seed={seed}
          template={source.mode === 'template' ? template : null}
          drifted={source.mode === 'literal' && source.drifted}
        />
      </NewScenarioLayout>
    );
  }

  if (wantedTemplate !== undefined) {
    const template = await getTemplate(wantedTemplate);
    if (template === null) notFound();

    // Untouched params are omitted rather than pre-filled: `resolveParams` supplies each
    // declared default for anything the form does not send, which is the same answer.
    return (
      <NewScenarioLayout title={`New scenario from “${template.name}”`}>
        <ScenarioEditor
          {...shared}
          initialName={template.name}
          initialSlug={uniqueSlug(slugify(template.name), taken)}
          seed={{ mode: 'template', templateId: template.id, params: {} }}
          template={template}
        />
      </NewScenarioLayout>
    );
  }

  return (
    <NewScenarioLayout title="New scenario">
      <ScenarioEditor
        {...shared}
        initialName="New scenario"
        initialSlug={uniqueSlug('new-scenario', taken)}
        seed={{ mode: 'literal', situation: blankSituation() }}
        template={null}
      />
    </NewScenarioLayout>
  );
}

function NewScenarioLayout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="max-w-2xl text-muted-foreground">
          What is saved is the rendered situation, closed over its content (ADR-0017) — plus the
          template and params behind it, which is how a fixture correction is taken up later.
        </p>
      </section>
      {children}
    </div>
  );
}
