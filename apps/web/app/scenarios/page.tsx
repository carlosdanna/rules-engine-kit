import Link from 'next/link';
import { NewScenarioDialog } from '@/components/scenarios/new-scenario-dialog';
import { ScenarioActions } from '@/components/scenarios/scenario-actions';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { listScenarios, listTemplates } from '@/lib/queries';
import { isEditable } from '@/lib/scenarios/write';

export const metadata = { title: 'Scenarios' };
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ScenariosPage() {
  const [scenarios, templates] = await Promise.all([listScenarios(), listTemplates()]);

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl space-y-3">
          <h1 className="text-2xl font-semibold tracking-tight">Scenarios</h1>
          <p className="text-muted-foreground">
            Saved situations. The ones from <code className="font-mono text-sm">scenarios/</code>{' '}
            are rebuilt by every <code className="font-mono text-sm">db:reset</code> and are read
            only; anything you make here is yours and survives one (ADR-0004).
          </p>
        </div>

        <NewScenarioDialog
          templates={templates.map(({ id, name, description }) => ({ id, name, description }))}
          scenarios={scenarios.map(({ id, name, origin }) => ({ id, name, origin }))}
        />
      </section>

      <section>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Built from</TableHead>
              <TableHead>Origin</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {scenarios.map((scenario) => (
              <TableRow key={scenario.id}>
                <TableCell className="font-medium">
                  <Link href={`/scenarios/${scenario.id}`} className="hover:underline">
                    {scenario.name}
                  </Link>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {scenario.id}
                </TableCell>
                <TableCell>
                  {scenario.templateId === null ? (
                    <span className="text-muted-foreground">written by hand</span>
                  ) : (
                    <Link
                      href={`/templates?template=${encodeURIComponent(scenario.templateId)}`}
                      className="font-mono text-xs hover:underline"
                    >
                      {scenario.templateId}
                    </Link>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={scenario.origin === 'seed' ? 'secondary' : 'outline'}>
                    {scenario.origin}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    <ScenarioActions
                      slug={scenario.id}
                      name={scenario.name}
                      editable={isEditable(scenario)}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {scenarios.length === 0 && (
          <p className="pt-4 text-muted-foreground">
            Nothing saved yet. Run <code className="font-mono text-sm">pnpm db:seed</code> for the
            starter scenarios, or make one with “New scenario”.
          </p>
        )}
      </section>
    </div>
  );
}
