import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ACCEPTANCE, compareHref } from '@/lib/acceptance';

/**
 * What the engine is, and the five acceptance scenarios one click away (docs/requirements.md).
 *
 * Each row is a link into `/compare`, which runs the scenario under both profiles on the server
 * and stores nothing, so the page itself touches no database. `lib/acceptance.test.ts` runs
 * every row and checks the outcome the row states.
 */
export default function HomePage() {
  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Rules Engine Kit</h1>
        <p className="max-w-2xl text-muted-foreground">
          A localhost demo of a deterministic, explainable, versioned rules engine. Give it a
          situation and an ordered stack of ruleset versions: it resolves the stack into one
          profile, runs the rules in fixed phases with a seeded RNG, and returns an outcome plus a
          trace of every rule it considered, fired or skipped, with the facts each one read.
        </p>
        <p className="max-w-2xl text-muted-foreground">
          The engine is the product. 5E-compatible content from SRD 5.1 and SRD 5.2.1 is the example
          data, which is what makes the versioning visible: the same situation under two editions
          gives two different answers, and both are fully explained.
        </p>
      </section>

      <section aria-labelledby="acceptance-heading" className="space-y-3">
        <div className="max-w-2xl space-y-1">
          <h2 id="acceptance-heading" className="text-xl font-semibold tracking-tight">
            Acceptance scenarios
          </h2>
          <p className="text-sm text-muted-foreground">
            Each one runs a seeded scenario under two profiles with the same seed, side by side,
            with every difference outlined. Nothing is stored, and the URL reproduces the run.
          </p>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Scenario</TableHead>
              <TableHead>Profile A</TableHead>
              <TableHead>Profile B</TableHead>
              <TableHead className="sr-only">Run</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ACCEPTANCE.map((row) => (
              <TableRow key={row.id} data-testid="acceptance-row">
                <TableCell className="font-medium whitespace-normal">{row.title}</TableCell>
                <TableCell className="whitespace-normal">
                  <span className="block font-mono text-xs text-muted-foreground">{row.a}</span>
                  {row.expected.a}
                </TableCell>
                <TableCell className="whitespace-normal">
                  <span className="block font-mono text-xs text-muted-foreground">{row.b}</span>
                  {row.expected.b}
                </TableCell>
                <TableCell className="text-right">
                  <Link
                    href={compareHref(row)}
                    aria-label={`Compare: ${row.title}`}
                    className={buttonVariants({ size: 'sm' })}
                  >
                    Compare
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="space-y-3 border-t pt-6">
        <div className="flex flex-wrap gap-3">
          <Link href="/playground" className={buttonVariants()}>
            Open the playground
          </Link>
          <Link href="/scenarios" className={buttonVariants({ variant: 'outline' })}>
            Scenarios
          </Link>
          <Link href="/profiles" className={buttonVariants({ variant: 'outline' })}>
            Profiles
          </Link>
          <Link href="/rulesets" className={buttonVariants({ variant: 'outline' })}>
            Rulesets
          </Link>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Make a scenario from a template or a blank slate, run it in the playground under any
          profile, and replay or explain the stored trace. Game content is credited on the{' '}
          <Link href="/credits" className="underline underline-offset-4 hover:text-foreground">
            Credits
          </Link>{' '}
          page.
        </p>
      </section>
    </div>
  );
}
