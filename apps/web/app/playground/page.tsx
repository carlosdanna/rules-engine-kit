import { PlaygroundForm } from '@/components/playground/playground-form';
import { listProfiles, listScenarios, listTemplates } from '@/lib/queries';

export const metadata = { title: 'Playground' };
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Run a saved scenario under a profile and seed (VR-7). `?scenario=<slug>` preselects one,
 * which is how "Open in playground" on `/scenarios/[slug]` arrives here.
 *
 * Editing a situation in place is not offered: a run stores a `scenario_id`, so the scenario
 * has to exist first, and `/scenarios/new` is where one is made.
 */
export default async function PlaygroundPage({ searchParams }: PageProps<'/playground'>) {
  const { scenario: wanted } = await searchParams;
  const [scenarios, profiles, templates] = await Promise.all([
    listScenarios(),
    listProfiles(),
    listTemplates(),
  ]);

  const suggested = new Map(templates.map((t) => [t.id, t.suggestedProfiles[0]]));
  const fallback = profiles[0]?.id ?? '';

  return (
    <div className="space-y-6">
      <section className="max-w-2xl space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Playground</h1>
        <p className="text-muted-foreground">
          Choose a saved scenario, a profile and a seed, then run it. Every run is stored with the
          profile hash, seed and engine version that produced it, so it can be replayed later.
        </p>
      </section>

      {scenarios.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No scenarios yet. Run <code className="font-mono">pnpm db:reset</code> to seed the starter
          scenarios.
        </p>
      ) : (
        <PlaygroundForm
          scenarios={scenarios.map((scenario) => ({
            id: scenario.id,
            name: scenario.name,
            defaultProfile:
              (scenario.templateId === null ? undefined : suggested.get(scenario.templateId)) ??
              fallback,
          }))}
          profiles={profiles.map((profile) => ({ id: profile.id, name: profile.name }))}
          initialScenario={(Array.isArray(wanted) ? wanted[0] : wanted) ?? null}
        />
      )}
    </div>
  );
}
