/**
 * A stored scenario, back out to a file (ADR-0004, ADR-0029).
 *
 * The inverse of `scenarios.ts`, and deliberately narrower: a scenario always exports as the
 * **literal** form, never as the template call it may have been created from. Three reasons,
 * and they are the whole of ADR-0029(c). A literal file needs no `profile`, which a stored row
 * does not have (ADR-0028 keeps it a render input). It is closed over its content (ADR-0017),
 * so a file exported today still describes the same situation after `content/` moves on. And
 * it round-trips through `ScenarioFile` and `loadScenarioDoc` unchanged, which the test beside
 * this file asserts — a template-form export would instead be a *promise* to re-render, which
 * is exactly what a file you are about to commit must not be.
 *
 * Serialising lives here rather than in `packages/engine` because `yaml` is only a
 * devDependency there: `transpilePackages` bundles the engine into the web app, so importing
 * it from `src/` would ship a devDependency to production.
 */

import { stringify } from 'yaml';
import { ScenarioFile } from './scenario';

/** Just enough of a `ScenarioRow` to export one, so this does not depend on the schema module. */
export type ExportableScenario = {
  id: string;
  name: string;
  situation: unknown;
};

/**
 * Parsed, not cast. The export is the one place a stored row becomes a file someone may
 * commit, so a row that has drifted out of shape should fail here rather than produce a
 * `scenarios/` file that `db:seed` then refuses.
 */
export function literalScenarioFile(row: ExportableScenario): ScenarioFile {
  return ScenarioFile.parse({ slug: row.id, name: row.name, situation: row.situation });
}

/** `<slug>.yaml`, the name `loadScenarios` expects to find in `scenarios/`. */
export const scenarioFileName = (slug: string): string => `${slug}.yaml`;

/**
 * The bytes. `lineWidth: 0` disables YAML's line folding: a folded long string is still
 * valid YAML, but it makes a diff of a committed scenario unreadable for no gain.
 */
export function scenarioToYaml(row: ExportableScenario): string {
  return stringify(literalScenarioFile(row), { lineWidth: 0 });
}
