import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function HomePage() {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Rules Engine Kit</h1>
        <p className="max-w-2xl text-muted-foreground">
          A localhost demo of a versioned rules engine. Give it a situation and a stack of ruleset
          versions; it resolves the stack into one profile, evaluates the rules in fixed phases, and
          returns an outcome plus a trace of every rule it considered, fired or skipped.
        </p>
        <p className="max-w-2xl text-muted-foreground">
          The engine is the product. 5E-compatible SRD content is the example data it runs on.
        </p>
      </section>

      <section className="flex flex-wrap gap-3">
        <Button size="lg" render={<Link href="/playground">Open the playground</Link>} />
        <Button
          size="lg"
          variant="outline"
          render={<Link href="/rulesets">Browse rulesets</Link>}
        />
      </section>

      <section className="space-y-2 border-t pt-6 text-sm text-muted-foreground">
        <p>
          This is the M0 shell: the workspace, the app layout and the tooling. The engine, the
          database and the seeded content arrive in later milestones, so every route above is still
          a placeholder.
        </p>
      </section>
    </div>
  );
}
