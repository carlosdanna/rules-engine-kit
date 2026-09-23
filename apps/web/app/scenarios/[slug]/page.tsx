import { SITUATION_SCHEMA_VERSION } from '@rules-engine-kit/engine';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ScenarioActions } from '@/components/scenarios/scenario-actions';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getScenario } from '@/lib/queries';
import { isEditable } from '@/lib/scenarios/write';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/scenarios/[slug]'>) {
  const { slug } = await params;
  const scenario = await getScenario(slug);
  return { title: scenario?.name ?? 'Scenario' };
}

export default async function ScenarioPage({ params }: PageProps<'/scenarios/[slug]'>) {
  const { slug } = await params;
  const scenario = await getScenario(slug);
  if (scenario === null) notFound();

  const stale = scenario.schemaVersion !== SITUATION_SCHEMA_VERSION;

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl space-y-3">
          <h1 className="text-2xl font-semibold tracking-tight">{scenario.name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs">
              {scenario.id}
            </Badge>
            <Badge variant={scenario.origin === 'seed' ? 'secondary' : 'outline'}>
              {scenario.origin}
            </Badge>
            <Badge variant="secondary" className="font-mono text-xs">
              situation v{scenario.schemaVersion}
            </Badge>
          </div>
        </div>

        <ScenarioActions slug={scenario.id} name={scenario.name} editable={isEditable(scenario)} />
      </section>

      {scenario.origin === 'seed' && (
        <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
          This one comes from <code className="font-mono">scenarios/</code> and is rebuilt by every{' '}
          <code className="font-mono">pnpm db:reset</code> (ADR-0004), so it cannot be edited here.
          Duplicate it to make a copy that is yours.
        </p>
      )}

      {stale && (
        <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
          Saved under situation schema v{scenario.schemaVersion}; the engine is now at v
          {SITUATION_SCHEMA_VERSION}. It is shown and exported as stored, but cannot be edited until
          saved user scenarios are migrated (VR-8).
        </p>
      )}

      <section className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Built from</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {scenario.templateId === null ? (
              <p className="text-muted-foreground">
                Written by hand — there is no template behind it to re-render from.
              </p>
            ) : (
              <>
                <Link
                  href={`/templates?template=${encodeURIComponent(scenario.templateId)}`}
                  className="font-mono text-xs hover:underline"
                >
                  {scenario.templateId}
                </Link>
                <pre className="overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs">
                  {JSON.stringify(scenario.params ?? {}, null, 2)}
                </pre>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>At a glance</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted-foreground">Actors</dt>
              <dd>{scenario.situation.actors.map((actor) => actor.name).join(', ')}</dd>
              <dt className="text-muted-foreground">Steps</dt>
              <dd>{scenario.situation.timeline.length}</dd>
              <dt className="text-muted-foreground">Items</dt>
              <dd>{Object.keys(scenario.situation.items).join(', ') || 'none'}</dd>
            </dl>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Situation</h2>
        <pre className="max-h-[36rem] overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs">
          {JSON.stringify(scenario.situation, null, 2)}
        </pre>
      </section>
    </div>
  );
}
