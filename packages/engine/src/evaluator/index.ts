export { createActorRefResolver, primaryTargetId, targetsOf } from './actorRef';
export { DERIVED_BASES, derivedTargetLabel, sealDerivedValues } from './derived';
export {
  describeFactResolution,
  FactResolutionError,
  type FactResolutionReason,
} from './errors';
export { createFactSource, type FactSourceArgs } from './facts';
export { disablingLayer, lastProvenance, selectRules } from './select';
