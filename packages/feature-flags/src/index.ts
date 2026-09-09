/**
 * @zudojs/feature-flags
 *
 * Feature flag system with deterministic rollouts, rule engine, providers, and evaluation context.
 *
 * @module index
 */

// ─── Types ────────────────────────────────────────────────────────────────
export type {
  FeatureFlagValue,
  FeatureFlagState,
  FeatureFlagVisibility,
  FeatureFlagOperator,
  FeatureFlagStaticRule,
  FeatureFlagUserRule,
  FeatureFlagTenantRule,
  FeatureFlagAttributeRule,
  FeatureFlagPercentageRule,
  FeatureFlagScheduleRule,
  FeatureFlagVariantRule,
  FeatureFlagVariant,
  FeatureFlagRule,
  FeatureFlagContext,
  FeatureFlagMetadata,
  FeatureFlag,
  FeatureFlagEvaluationReason,
  FeatureFlagEvaluation,
  FeatureFlagProvider,
  FeatureFlagChangeListener,
  Unsubscribe,
} from "./featureFlagTypes/index.js";

// ─── Errors ───────────────────────────────────────────────────────────────
export { FeatureFlagError } from "./featureFlagErrors/featureFlagError.base.js";
export type { FeatureFlagErrorOptions } from "./featureFlagErrors/featureFlagError.base.js";
export {
  FeatureFlagNotFoundError,
  FeatureFlagProviderError,
  FeatureFlagEvaluationError,
  FeatureFlagRuleError,
  FeatureFlagDependencyError,
  FeatureFlagConfigurationError,
  FeatureFlagTypeError,
} from "./featureFlagErrors/featureFlagError.types.js";

// ─── Rollout ──────────────────────────────────────────────────────────────
export { hashString } from "./rollout/rolloutHashing.js";
export { getBucket, isInRollout } from "./rollout/rolloutBucketing.js";

// ─── Providers ────────────────────────────────────────────────────────────
export { createMemoryProvider } from "./provider/providerMemory.core.js";
export type { MemoryFeatureFlagProvider } from "./provider/providerMemory.core.js";
export { createEnvironmentProvider } from "./provider/providerEnvironment.core.js";
export type { EnvironmentProviderOptions } from "./provider/providerEnvironment.core.js";
export { createCompositeProvider } from "./provider/providerComposite.core.js";
export { createCachedProvider } from "./provider/providerCached.core.js";
export type { CachedProviderOptions } from "./provider/providerCached.core.js";

// ─── Evaluator ────────────────────────────────────────────────────────────
export { resolvePath, matchAttribute } from "./evaluator/evaluatorAttribute.js";
export { evaluateRule } from "./evaluator/evaluatorRule.core.js";
export type { RuleEvaluationResult } from "./evaluator/evaluatorRule.core.js";
export { evaluateFlag } from "./evaluator/evaluator.core.js";
export type { EvaluateFlagOptions } from "./evaluator/evaluator.core.js";

// ─── Registry ─────────────────────────────────────────────────────────────
export { createFeatureFlagRegistry } from "./registry/registry.core.js";
export type { FeatureFlagRegistry } from "./registry/registry.core.js";

// ─── FeatureFlags ─────────────────────────────────────────────────────────
export { createFeatureFlags } from "./featureFlags/featureFlags.core.js";
export type {
  FeatureFlags,
  FeatureFlagsOptions,
} from "./featureFlags/featureFlags.core.js";
export {
  resolveDependencies,
  mergeContext,
} from "./featureFlags/featureFlags.resolve.js";

// ─── Utils ────────────────────────────────────────────────────────────────
export { isPlainObject, valuesEqual } from "./utils/utils.helper.js";
