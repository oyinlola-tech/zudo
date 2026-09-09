/**
 * Feature flag provider interface.
 *
 * Providers supply flag definitions from any source — memory, environment, database, or remote API.
 *
 * @module featureFlagTypes/featureFlagProvider
 */

import type { FeatureFlag } from "./featureFlag.interface.js";

/** Listener called when flags change. */
export type FeatureFlagChangeListener = (flags: readonly FeatureFlag[]) => void;

/** Unsubscribe function for flag change listeners. */
export type Unsubscribe = () => void;

/** Abstract provider for feature flag definitions. */
export interface FeatureFlagProvider {
  /** Retrieve a single flag by key. */
  get(key: string): Promise<FeatureFlag | undefined>;
  /** Retrieve all flags. */
  getAll(): Promise<readonly FeatureFlag[]>;
  /** Optional: refresh flags from the source. */
  refresh?(): Promise<void>;
  /** Optional: subscribe to flag changes. */
  subscribe?(listener: FeatureFlagChangeListener): Unsubscribe;
}

/**
 * A provider that always implements {@link FeatureFlagProvider.refresh}.
 *
 * The built-in providers all do, but declaring them as `FeatureFlagProvider`
 * hid it behind an optional method, so a caller could not invoke `refresh()`
 * without a non-null assertion.
 */
export interface RefreshableFeatureFlagProvider extends FeatureFlagProvider {
  refresh(): Promise<void>;
}
