/**
 * Feature flag definition interface.
 *
 * Represents a complete feature flag with rules, metadata, and configuration.
 *
 * @module featureFlagTypes/featureFlag
 */

import type {
  FeatureFlagValue,
  FeatureFlagState,
  FeatureFlagVisibility,
} from "./featureFlagRule/featureFlagValue.type.js";
import type {
  FeatureFlagRule,
  FeatureFlagVariant,
} from "./featureFlagRule/featureFlagRule.type.js";

/** Metadata about a feature flag. */
export interface FeatureFlagMetadata {
  /** Owner team or individual. */
  readonly owner?: string;
  /** Team responsible. */
  readonly team?: string;
  /** When the flag was created. */
  readonly createdAt?: Date;
  /** When the flag was last updated. */
  readonly updatedAt?: Date;
  /** When the flag expires. */
  readonly expiresAt?: Date;
  /** Associated ticket or issue. */
  readonly ticket?: string;
  /** Tags for categorization. */
  readonly tags?: readonly string[];
}

/** A complete feature flag definition. */
export interface FeatureFlag {
  /** Unique key identifying this flag. */
  readonly key: string;
  /** Default value when no rule matches. */
  readonly defaultValue: FeatureFlagValue;
  /**
   * Whether the flag is globally enabled — the kill switch. A flag with
   * `enabled: false` serves its off value, never `defaultValue: true`.
   */
  readonly enabled: boolean;
  /**
   * What the flag serves while it is off: killed, draft, archived, expired,
   * or blocked by a dependency. Default: `false` for a boolean flag, the
   * `defaultValue` for any other.
   */
  readonly offValue?: FeatureFlagValue;
  /** Human-readable description. */
  readonly description?: string;
  /** Lifecycle state. */
  readonly state?: FeatureFlagState;
  /** Visibility scope. */
  readonly visibility?: FeatureFlagVisibility;
  /** Targeting rules evaluated in order. */
  readonly rules?: readonly FeatureFlagRule[];
  /** Variant definitions for A/B testing. */
  readonly variants?: readonly FeatureFlagVariant[];
  /** Feature flags this flag depends on. */
  readonly dependencies?: readonly string[];
  /** Additional metadata. */
  readonly metadata?: FeatureFlagMetadata;
}
