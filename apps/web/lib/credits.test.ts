import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CreditsParseError, parseSoftwareSection, readSoftwareCredits } from '@/lib/credits';
import { repoRoot } from '@/lib/db';

/**
 * The parser is only worth having if it stays true to the real file, so the first block runs
 * against `CREDITS.md` itself rather than a fixture. If someone reshapes that section, these
 * fail before `/credits` silently renders an empty table.
 */
describe('the real CREDITS.md', () => {
  it('parses into the Runtime and Tooling groups', async () => {
    const groups = await readSoftwareCredits();
    expect(groups.map((group) => group.label)).toEqual(['Runtime', 'Tooling']);
  });

  it('gives every entry a name, a URL and a licence', async () => {
    for (const group of await readSoftwareCredits()) {
      expect(group.entries.length).toBeGreaterThan(0);
      for (const entry of group.entries) {
        expect(entry.name).not.toBe('');
        expect(entry.url).toMatch(/^https?:\/\//);
        expect(entry.license).not.toBe('');
      }
    }
  });

  it('credits every runtime dependency this app declares', async () => {
    const groups = await readSoftwareCredits();
    const credited = groups.flatMap((group) => group.entries.map((entry) => entry.name));
    const pkg = JSON.parse(
      await readFile(join(repoRoot(), 'apps', 'web', 'package.json'), 'utf8'),
    ) as { dependencies: Record<string, string> };

    // Workspace packages are this repository; everything else is someone else's work and
    // needs a line. The map is from package name to the name CREDITS.md prints.
    const names: Record<string, string> = {
      '@base-ui/react': 'Base UI',
      '@tanstack/react-table': 'TanStack Table',
      'class-variance-authority': 'class-variance-authority',
      cn: 'cn',
      'drizzle-orm': 'Drizzle ORM',
      'lucide-react': 'Lucide',
      next: 'Next.js',
      react: 'React',
      'react-dom': 'React',
      shadcn: 'shadcn/ui',
      'server-only': 'server-only',
      'tw-animate-css': 'tw-animate-css',
    };

    for (const dep of Object.keys(pkg.dependencies)) {
      if (dep.startsWith('@rules-engine-kit/')) continue;
      const printed = names[dep];
      expect(printed, `no CREDITS.md name mapped for ${dep}`).toBeDefined();
      expect(credited, `${dep} is not credited`).toContain(printed);
    }
  });
});

describe('parseSoftwareSection', () => {
  const section = [
    '# Credits',
    '',
    '## Data',
    '',
    '- something',
    '',
    '## Software',
    '',
    'Runtime:',
    '',
    '| Package | Licence |',
    '| --- | --- |',
    '| [Next.js](https://nextjs.org) | MIT |',
    '',
    'Tooling:',
    '',
    '| Package | Licence |',
    '| --- | --- |',
    '| [Vitest](https://vitest.dev) | MIT |',
    '',
  ].join('\n');

  it('reads the groups and their rows, and drops the header separator', () => {
    expect(parseSoftwareSection(section)).toEqual([
      {
        label: 'Runtime',
        entries: [{ name: 'Next.js', url: 'https://nextjs.org', license: 'MIT' }],
      },
      {
        label: 'Tooling',
        entries: [{ name: 'Vitest', url: 'https://vitest.dev', license: 'MIT' }],
      },
    ]);
  });

  it('ignores everything before the heading', () => {
    expect(parseSoftwareSection(section)[0]?.entries).toHaveLength(1);
  });

  it('stops at the next heading', () => {
    const withTrailer = `${section}\n## Later\n\n| [Nope](https://no.example) | MIT |\n`;
    const groups = parseSoftwareSection(withTrailer);
    expect(groups.flatMap((group) => group.entries.map((e) => e.name))).not.toContain('Nope');
  });

  it('throws when the section is missing', () => {
    expect(() => parseSoftwareSection('# Credits\n\n## Data\n')).toThrow(CreditsParseError);
  });

  it('throws on a group with no rows', () => {
    expect(() => parseSoftwareSection('\n## Software\n\nRuntime:\n\n')).toThrow(CreditsParseError);
  });
});
