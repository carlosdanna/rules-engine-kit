import Link from 'next/link';

/** Routes in the order they appear in `docs/architecture.md`. */
const navItems = [
  { href: '/scenarios', label: 'Scenarios' },
  { href: '/playground', label: 'Playground' },
  { href: '/compare', label: 'Compare' },
  { href: '/rulesets', label: 'Rulesets' },
  { href: '/templates', label: 'Templates' },
  { href: '/profiles', label: 'Profiles' },
] as const;

export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4">
        <Link href="/" className="font-semibold tracking-tight">
          Rules Engine Kit
        </Link>
        <nav aria-label="Main" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
