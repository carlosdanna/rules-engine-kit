import { ExternalLinkIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { readSoftwareCredits } from '@/lib/credits';
import { listSources } from '@/lib/queries';

export const metadata = { title: 'Credits' };
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function CreditsPage() {
  const [sources, software] = await Promise.all([listSources(), readSoftwareCredits()]);

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Credits</h1>
        <p className="max-w-2xl text-muted-foreground">
          Sources, licences and attribution for the rule packs this demo ships and the software it
          is built on. Content attribution comes from the seeded <code>sources</code> table; the
          software list is read from <code>CREDITS.md</code>.
        </p>
      </section>

      <section className="space-y-6">
        <h2 className="text-lg font-semibold tracking-tight">Content sources</h2>
        {sources.map((source) => (
          <article key={source.id} className="space-y-3 rounded-lg border p-5">
            <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="font-semibold tracking-tight">{source.name}</h3>
              <Badge variant="secondary">{source.license}</Badge>
              <span className="text-sm text-muted-foreground">{source.author}</span>
            </header>

            {/*
              The attribution text is a licence obligation, printed exactly as the pack
              declares it. It is never reflowed, trimmed or summarised.
            */}
            <blockquote className="border-l-2 pl-4 text-sm text-muted-foreground">
              {source.attributionText}
            </blockquote>

            <a
              href={source.url}
              className="inline-flex items-center gap-1.5 text-sm underline underline-offset-4 hover:text-foreground"
              rel="noreferrer noopener"
              target="_blank"
            >
              {source.url}
              <ExternalLinkIcon className="size-3.5" />
            </a>
          </article>
        ))}
      </section>

      <section className="space-y-6">
        <h2 className="text-lg font-semibold tracking-tight">Software</h2>
        {software.map((group) => (
          <div key={group.label} className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">{group.label}</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Package</TableHead>
                  <TableHead>Licence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.entries.map((entry) => (
                  <TableRow key={entry.name}>
                    <TableCell>
                      <a
                        href={entry.url}
                        className="underline underline-offset-4 hover:text-foreground"
                        rel="noreferrer noopener"
                        target="_blank"
                      >
                        {entry.name}
                      </a>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{entry.license}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))}
      </section>
    </div>
  );
}
