/**
 * In-memory feature flag provider.
 *
 * Stores flags in a Map for O(1) lookup. Ideal for local apps and testing.
 *
 * @module provider/providerMemory
 */

import type { FeatureFlag } from "../featureFlagTypes/featureFlag.interface.js";
import type {
  FeatureFlagChangeListener,
  FeatureFlagProvider,
  Unsubscribe,
} from "../featureFlagTypes/featureFlagProvider.js";

/**
 * An in-memory provider, with the mutation methods it actually has.
 *
 * `createMemoryProvider` used to return `FeatureFlagProvider` through a cast,
 * so `set` and `delete` existed at runtime and were invisible to the type
 * system — callers had to cast to reach them.
 */
export interface MemoryFeatureFlagProvider extends FeatureFlagProvider {
  /** Add or update a flag at runtime, notifying subscribers. */
  set(flag: FeatureFlag): void;
  /** Remove a flag by key, notifying subscribers. Returns whether it existed. */
  delete(key: string): boolean;
  /** Replace every flag at once, notifying subscribers. */
  setAll(flags: readonly FeatureFlag[]): void;
  subscribe(listener: FeatureFlagChangeListener): Unsubscribe;
}

/**
 * Create an in-memory feature flag provider.
 *
 * @param flags - Initial flag definitions.
 * @returns A FeatureFlagProvider backed by a Map.
 */
export function createMemoryProvider(
  flags: readonly FeatureFlag[] = [],
): MemoryFeatureFlagProvider {
  const store = new Map<string, FeatureFlag>();
  const listeners = new Set<FeatureFlagChangeListener>();

  for (const flag of flags) {
    store.set(flag.key, Object.freeze({ ...flag }));
  }

  function snapshot(): readonly FeatureFlag[] {
    return [...store.values()];
  }

  /** Announce a change so an already-loaded consumer picks it up. */
  function notify(): void {
    if (listeners.size === 0) return;
    const current = snapshot();
    for (const listener of listeners) {
      // A broken listener must not stop the others, or the mutation itself.
      try {
        listener(current);
      } catch {
        /* listener failures are the listener's problem */
      }
    }
  }

  return {
    async get(key: string): Promise<FeatureFlag | undefined> {
      return store.get(key);
    },

    async getAll(): Promise<readonly FeatureFlag[]> {
      return snapshot();
    },

    set(flag: FeatureFlag): void {
      store.set(flag.key, Object.freeze({ ...flag }));
      notify();
    },

    delete(key: string): boolean {
      const existed = store.delete(key);
      if (existed) notify();
      return existed;
    },

    setAll(next: readonly FeatureFlag[]): void {
      store.clear();
      for (const flag of next) {
        store.set(flag.key, Object.freeze({ ...flag }));
      }
      notify();
    },

    subscribe(listener: FeatureFlagChangeListener): Unsubscribe {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
