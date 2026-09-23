/**
 * The content loader: `content/` on disk → the schema shapes the engine and the seeds
 * share (`architecture.md`). Reading bytes is this package's job; deciding what an
 * authored shorthand *means* is `packages/engine/src/content`'s, and stays pure (ADR-0020).
 */

export { ContentLoadError } from './errors';
export {
  type ContentLintReport,
  lintContentTree,
} from './lint';
export { type LoadedContent, loadContentPack, loadContentTree } from './load';
export { displayPath, type ReadResult, readYamlDoc } from './read';
export {
  isTemplateScenario,
  type LoadedScenario,
  ScenarioBody,
  ScenarioFile,
  ScenarioInput,
  ScenarioName,
  ScenarioSlug,
} from './scenario';
export { loadScenarioDoc, loadScenarios, type ScenarioSources } from './scenarios';
export {
  type ExportableScenario,
  literalScenarioFile,
  scenarioFileName,
  scenarioToYaml,
} from './serialize';
export {
  type DiscoveredContent,
  discoverContent,
  isEmptyTree,
  isPackDir,
  PACK_MANIFEST,
} from './tree';
