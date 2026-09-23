import { notFound } from 'next/navigation';
import { type EditorSeed, ScenarioEditor } from '@/components/scenarios/scenario-editor';
import {
  conditionNames,
  getScenario,
  getTemplate,
  listFixtures,
  listProfiles,
} from '@/lib/queries';
import { editorSeedFor, isEditable } from '@/lib/scenarios/write';

export const metadata = { title: 'Edit scenario' };
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A route rather than `?edit=` on the detail page: it needs different data — the template and
 * every fixture, so the form can re-render — and `PageProps` types the slug for free.
 *
 * A seeded row 404s here rather than rendering a disabled form. It is rebuilt from
 * `scenarios/` on every `db:reset` (ADR-0004), so there is no edit to offer; the detail page
 * says so and points at Duplicate. The writer refuses one too, so this is the affordance
 * rather than the guarantee.
 */
export default async function EditScenarioPage({ params }: PageProps<'/scenarios/[slug]/edit'>) {
  const { slug } = await params;
  const scenario = await getScenario(slug);
  if (scenario === null || !isEditable(scenario)) notFound();

  const template = scenario.templateId === null ? null : await getTemplate(scenario.templateId);
  const [fixtures, profiles, conditions] = await Promise.all([
    listFixtures(),
    listProfiles(),
    conditionNames(),
  ]);

  const source = editorSeedFor(scenario, template);
  const seed: EditorSeed =
    source.mode === 'template'
      ? { mode: 'template', templateId: source.templateId, params: source.params }
      : { mode: 'literal', situation: source.situation };

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Edit “{scenario.name}”</h1>
        <p className="max-w-2xl text-muted-foreground">
          Saving re-renders the situation server-side and stores it. The slug is the row’s primary
          key and does not change (ADR-0027).
        </p>
      </section>

      <ScenarioEditor
        editing={scenario.id}
        initialName={scenario.name}
        initialSlug={scenario.id}
        seed={seed}
        template={source.mode === 'template' ? template : null}
        fixtures={fixtures}
        profiles={profiles.map((profile) => profile.id)}
        conditions={conditions}
        drifted={source.mode === 'literal' && source.drifted}
      />
    </div>
  );
}
