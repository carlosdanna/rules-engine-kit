import 'server-only';

/**
 * The `## Software` section of `CREDITS.md`, parsed.
 *
 * CREDITS.md is the source of truth for dependency attribution — CLAUDE.md requires it to be
 * accurate, and duplicating its contents into a page would give the repository two lists to
 * keep in step. So `/credits` reads the file rather than restating it. Content attribution
 * comes from the `sources` table instead (NFR-6); only the software tables live here.
 *
 * The parse is deliberately narrow: the two labelled pipe tables the section actually holds,
 * and nothing else. It throws rather than returning an empty list, because a credits page
 * that quietly renders nothing is the one failure mode that matters. `credits.test.ts` runs
 * it against the real file.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { repoRoot } from '@/lib/db';

export type SoftwareEntry = { name: string; url: string; license: string };
export type SoftwareGroup = { label: string; entries: SoftwareEntry[] };

export class CreditsParseError extends Error {
  constructor(detail: string) {
    super(`CREDITS.md: ${detail}`);
    this.name = 'CreditsParseError';
  }
}

/** `| [Name](url) | Licence |` — the only row shape the section uses. */
const ROW = /^\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|\s*([^|]+?)\s*\|$/;

export function parseSoftwareSection(markdown: string): SoftwareGroup[] {
  const start = markdown.indexOf('\n## Software\n');
  if (start === -1) throw new CreditsParseError('no `## Software` heading');

  // The section runs to the next `## ` heading, or to the end of the file.
  const rest = markdown.slice(start + 1);
  const next = rest.indexOf('\n## ', 1);
  const section = next === -1 ? rest : rest.slice(0, next);

  const groups: SoftwareGroup[] = [];
  for (const line of section.split('\n')) {
    const label = /^(\w[\w ]*):$/.exec(line.trim());
    if (label?.[1]) {
      groups.push({ label: label[1], entries: [] });
      continue;
    }

    const row = ROW.exec(line.trim());
    if (!row) continue;

    const group = groups.at(-1);
    if (!group) throw new CreditsParseError(`table row before any group label: ${line.trim()}`);

    const [, name, url, license] = row;
    if (!name || !url || !license) {
      throw new CreditsParseError(`incomplete row: ${line.trim()}`);
    }
    // The header separator `| --- | --- |` does not match ROW, so nothing filters it here.
    group.entries.push({ name, url, license });
  }

  if (groups.length === 0) throw new CreditsParseError('`## Software` has no labelled groups');
  for (const group of groups) {
    if (group.entries.length === 0) {
      throw new CreditsParseError(`group "${group.label}" has no entries`);
    }
  }
  return groups;
}

export async function readSoftwareCredits(): Promise<SoftwareGroup[]> {
  return parseSoftwareSection(await readFile(join(repoRoot(), 'CREDITS.md'), 'utf8'));
}
