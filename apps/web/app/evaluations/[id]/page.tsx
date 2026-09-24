import { ENGINE_VERSION } from '@rules-engine-kit/engine';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { OutcomeSummary } from '@/components/evaluations/outcome-summary';
import { ReplayPanel } from '@/components/evaluations/replay-panel';
import { TraceViewer } from '@/components/evaluations/trace-viewer';
import { buttonVariants } from '@/components/ui/button';
import { getEvaluation, getProfile, getScenario } from '@/lib/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/evaluations/[id]'>) {
  const { id } = await params;
  return { title: `Evaluation ${id.slice(0, 8)}` };
}

/**
 * One stored run (VR-7), rendered from the row alone: the situation it ran is stored with it
 * (ADR-0030), so the narrative keeps its actor names even if the scenario has been edited or
 * renamed since. A run from another engine version is labelled before anything else on the
 * page, because every number below it is that engine's.
 */
export default async function EvaluationPage({ params }: PageProps<'/evaluations/[id]'>) {
  const { id } = await params;
  const evaluation = await getEvaluation(id);
  if (evaluation === null) notFound();

  const [scenario, profile] = await Promise.all([
    getScenario(evaluation.scenarioId),
    getProfile(evaluation.profileId),
  ]);
  const otherEngine = evaluation.engineVersion !== ENGINE_VERSION;
  const profileMoved = profile !== null && profile.resolvedHash !== evaluation.profileHash;

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Stored evaluation</h1>
          <p className="font-mono text-sm text-muted-foreground">{evaluation.id}</p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <Link
            href={`/playground?scenario=${encodeURIComponent(evaluation.scenarioId)}`}
            className={buttonVariants({ variant: 'outline' })}
          >
            Run again in playground
          </Link>
          <ReplayPanel id={evaluation.id} recordedEngine={evaluation.engineVersion} />
        </div>
      </section>

      {otherEngine && (
        <p
          className="rounded-lg border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-sm"
          role="alert"
          data-testid="engine-version-warning"
        >
          Recorded with engine <strong>v{evaluation.engineVersion}</strong>; this is engine{' '}
          <strong>v{ENGINE_VERSION}</strong>. What is shown is the stored run. A replay runs on the
          current engine and may differ.
        </p>
      )}
      {profileMoved && (
        <p
          className="rounded-lg border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-sm"
          role="alert"
        >
          Profile <span className="font-mono">{evaluation.profileId}</span> now resolves to a
          different hash than this run recorded, so a replay runs different rules.
        </p>
      )}

      <OutcomeSummary
        outcome={evaluation.outcome}
        situation={evaluation.situation}
        scenario={{ id: evaluation.scenarioId, name: scenario?.name ?? evaluation.scenarioId }}
        profile={{ id: evaluation.profileId, name: profile?.name ?? evaluation.profileId }}
      />
      <TraceViewer
        trace={evaluation.trace}
        situation={evaluation.situation}
        evaluationId={evaluation.id}
      />
    </div>
  );
}
