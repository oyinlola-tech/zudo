/**
 * Feature flag type definitions.
 */

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
} from "./featureFlagRule/index.js";

export type { FeatureFlagContext } from "./featureFlagContext.js";

export type {
  FeatureFlagMetadata,
  FeatureFlag,
} from "./featureFlag.interface.js";

export type {
  FeatureFlagEvaluationReason,
  FeatureFlagEvaluation,
} from "./featureFlagEvaluation.js";

export type {
  FeatureFlagProvider,
  RefreshableFeatureFlagProvider,
  FeatureFlagChangeListener,
  Unsubscribe,
} from "./featureFlagProvider.js";
