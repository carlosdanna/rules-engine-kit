/**
 * `scenarios/` on disk → the rows `db:seed` writes (ADR-0028).
 *
 * The walker is `tree.ts`'s: sorted by filename, so a report and a seeded database read the
 * same on every machine, and a file that cannot be read is a diagnostic rather than a throw
 * only where the caller collects diagnostics. This one throws, because its caller is the
 * seeder and a half-seeded database is worse than a failed seed (`load.ts` says the same).
 *
 * YAML and JSON are both accepted. `content-authoring.md` has always shown
 * `scenarios/melee-attack.json` in its `pnpm engine run` example, and everything else authored
 * in this repository is YAML; the parser reads both, since YAML is a superset of JSON.
 */

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Fixture, Template } from '@rules-engine-kit/engine';
import { buildFixtureIndex, renderTemplate } from '@rules-engine-kit/engine';
import { ContentLoadError } from './errors';
import { displayPath, readYamlDoc } from './read';
import { isTemplateScenario, type LoadedScenario, ScenarioFile } from './scenario';

const isReadable = (name: string) =>
  name.endsWith('.yaml') || name.endsWith('.yml') || name.endsWith('.json');

/** Sorted, for the reason `tree.ts` sorts its rule files: one answer per machine. */
function scenarioFilesIn(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isReadable(entry.name))
    .map((entry) => entry.name)
    .sort()
    .map((name) => join(dir, name));
}

export type ScenarioSources = {
  templates: readonly Template[];
  fixtures: readonly Fixture[];
};

/**
 * One file. The template form is rendered here rather than stored rendered, which is the
 * whole point of the envelope: `renderTemplate` is the same function the golden cases call,
 * so a template that stops rendering fails the seed instead of leaving a stale situation
 * behind (ADR-0028).
 */
export function loadScenarioDoc(
  doc: unknown,
  file: string,
  sources: ScenarioSources,
): LoadedScenario {
  const parsed = ScenarioFile.safeParse(doc);
  if (!parsed.success) {
    throw new ContentLoadError(
      `${file} is not a scenario: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.') || '<root>'} — ${issue.message}`)
        .join('; ')}`,
    );
  }

  const scenario = parsed.data;
  if (!isTemplateScenario(scenario)) {
    return {
      slug: scenario.slug,
      name: scenario.name,
      situation: scenario.situation,
      templateId: null,
      params: null,
    };
  }

  const template = sources.templates.find((candidate) => candidate.id === scenario.template);
  if (template === undefined) {
    throw new ContentLoadError(
      `${file} renders template '${scenario.template}', which content/templates/ does not declare`,
    );
  }

  let situation: LoadedScenario['situation'];
  try {
    situation = renderTemplate(
      template,
      scenario.params,
      buildFixtureIndex(sources.fixtures),
      scenario.profile,
    );
  } catch (thrown) {
    throw new ContentLoadError(
      `${file} does not render under profile '${scenario.profile}': ${(thrown as Error).message}`,
    );
  }

  return {
    slug: scenario.slug,
    name: scenario.name,
    situation,
    templateId: template.id,
    params: scenario.params,
  };
}

/**
 * Every scenario in `dir`, rendered. An absent directory is zero scenarios rather than an
 * error: `content:lint <one-pack>` and a fresh checkout of a tree with no saved situations
 * are both legitimate.
 */
export function loadScenarios(dir: string, sources: ScenarioSources): LoadedScenario[] {
  const seen = new Set<string>();

  return scenarioFilesIn(dir).map((path) => {
    const file = displayPath(path);
    const read = readYamlDoc(path);
    const issue = read.issues[0];
    if (issue !== undefined) throw new ContentLoadError(`${file}: ${issue.message}`);

    const scenario = loadScenarioDoc(read.doc.doc, file, sources);
    if (seen.has(scenario.slug)) {
      throw new ContentLoadError(
        `${file}: a second scenario claims the slug '${scenario.slug}', which is a row's identity (ADR-0027)`,
      );
    }
    seen.add(scenario.slug);
    return scenario;
  });
}
