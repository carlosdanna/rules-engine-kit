/**
 * Template + params + fixtures → a self-contained `Situation` (FR-18, FR-19, FR-20).
 *
 * ADR-0017 said a rendered situation is closed over its content; ADR-0026 settled what the
 * skeleton looks like, what a profile slug names and what indexes a fixture slug to one
 * variant under it — the three things Q24 was holding open.
 */

export { TemplateRenderError, type TemplateRenderErrorReason } from './errors';
export { buildFixtureIndex, type FixtureIndex } from './fixtureIndex';
export {
  type ActorFixture,
  type ActorPlacement,
  actorFromFixture,
  type ItemFixture,
  itemFromFixture,
} from './inline';
export { type ResolvedParams, resolveParams } from './params';
export { renderTemplate } from './render';
