import { CompareForm, type CompareInputs } from '@/components/compare/compare-form';
import { CompareView } from '@/components/compare/compare-view';
import { DiffSummary } from '@/components/compare/diff-summary';
import { compareRuns } from '@/lib/compare/run';
import { getDb } from '@/lib/db';
import { listProfiles, listScenarios } from '@/lib/queries';

export const metadata = { title: 'Compare' };
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The edition difference is what the demo is about, so it is what an empty URL shows. */
const DEFAULT_A = 'srd-5.1';
const DEFAULT_B = 'srd-5.2.1';
const DEFAULT_SEED = 'demo';

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/**
 * One saved scenario under two profiles with one seed, side by side (FR-16, ADR-0031).
 *
 * The inputs are the query string, so the page is a function of its URL: both sides run on the
 * server from rows, as the playground runs, and neither is stored.
 */
export default async function ComparePage({ searchParams }: PageProps<'/compare'>) {
  const query = await searchParams;
  const [scenarios, profiles] = await Promise.all([listScenarios(), listProfiles()]);

  if (scenarios.length === 0 || profiles.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing to compare yet. Run <code className="font-mono">pnpm db:reset</code> to seed the
        starter scenarios and profiles.
      </p>
    );
  }

  const profileIds = new Set(profiles.map((profile) => profile.id));
  const pick = (wanted: string | undefined, fallback: string, index: number) =>
    wanted ?? (profileIds.has(fallback) ? fallback : ((profiles[index] ?? profiles[0])?.id ?? ''));

  const inputs: CompareInputs = {
    scenario: first(query.scenario) ?? scenarios[0]?.id ?? '',
    a: pick(first(query.a), DEFAULT_A, 0),
    b: pick(first(query.b), DEFAULT_B, 1),
    seed: first(query.seed)?.trim() || DEFAULT_SEED,
  };

  const result = compareRuns(getDb(), {
    scenarioId: inputs.scenario,
    a: inputs.a,
    b: inputs.b,
    seed: inputs.seed,
  });
  const nameOf = (id: string) => profiles.find((profile) => profile.id === id)?.name ?? id;
  const scenario = scenarios.find((row) => row.id === inputs.scenario);

  return (
    <div className="space-y-6">
      <section className="max-w-2xl space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Compare</h1>
        <p className="text-muted-foreground">
          Run one saved scenario under two profiles with the same seed. Trace events are aligned on
          step, phase and rule key, and the ones that differ are outlined. Nothing is stored, and
          the URL reproduces the comparison.
        </p>
      </section>

      <CompareForm
        key={JSON.stringify(inputs)}
        scenarios={scenarios.map((row) => ({ id: row.id, name: row.name }))}
        profiles={profiles.map((profile) => ({ id: profile.id, name: profile.id }))}
        initial={inputs}
      />

      {!result.ok ? (
        <div className="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive">
          {result.formErrors.map((message) => (
            <p key={message} className="whitespace-pre-wrap">
              {message}
            </p>
          ))}
        </div>
      ) : (
        <>
          <DiffSummary
            outcomeDiff={result.data.outcomeDiff}
            traceDiff={result.data.traceDiff}
            labels={{ a: inputs.a, b: inputs.b }}
          />
          <CompareView
            situation={result.data.situation}
            scenario={{ id: inputs.scenario, name: scenario?.name ?? inputs.scenario }}
            a={{
              profile: { id: inputs.a, name: nameOf(inputs.a) },
              outcome: result.data.a.outcome,
              trace: result.data.a.trace,
            }}
            b={{
              profile: { id: inputs.b, name: nameOf(inputs.b) },
              outcome: result.data.b.outcome,
              trace: result.data.b.trace,
            }}
            highlight={result.data.traceDiff.events
              .filter((event) => event.status !== 'same')
              // A repeated key is numbered (`…#2`); the viewer keys by `alignmentKey` alone.
              .map((event) => event.key.replace(/#\d+$/, ''))}
          />
        </>
      )}
    </div>
  );
}
