import 'server-only';

/**
 * A stored scenario as a file you could commit (ADR-0004, ADR-0029).
 *
 * The serialising itself is `packages/db`'s, beside the loader that has to read the result
 * back; this is only the part that names the download. It runs on the server so `yaml` stays
 * out of the web app's dependencies — the browser receives a string and makes a Blob of it.
 */

import { type ScenarioRow, scenarioFileName, scenarioToYaml } from '@rules-engine-kit/db';

export type ScenarioExport = { filename: string; yaml: string };

export function scenarioExport(row: ScenarioRow): ScenarioExport {
  return { filename: scenarioFileName(row.id), yaml: scenarioToYaml(row) };
}
