import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function RulesetVersionNotFound() {
  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-semibold tracking-tight">No such ruleset version</h1>
      <p className="text-muted-foreground">
        A version is identified by its ruleset slug and its semver (ADR-0016) — for example{' '}
        <code>/rulesets/dnd5e-srd/5.2.1</code>. Nothing seeded matches this one.
      </p>
      <Button variant="outline" render={<Link href="/rulesets">Back to rulesets</Link>} />
    </section>
  );
}
