/**
 * Dependency resolution and context merging for FeatureFlags.
 *
 * @module featureFlags/featureFlags.resolve
 */

import type { FeatureFlagContext } from "../featureFlagTypes/featureFlagContext.js";
import type { FeatureFlagRegistry } from "../registry/registry.core.js";

/**
 * Resolve dependencies for a flag, detecting cycles.
 *
 * @param key - The flag key to resolve.
 * @param registry - The flag registry.
 * @param chain - Keys on the current resolution path, for cycle detection.
 * @param satisfied - Keys already proved satisfied, to avoid re-walking them.
 * @returns True if the flag and all its transitive dependencies are enabled.
 */
export function resolveDependencies(
  key: string,
  registry: FeatureFlagRegistry,
  chain: Set<string> = new Set(),
  satisfied: Set<string> = new Set(),
): boolean {
  // A key already proved good on another branch is good here too. Reusing one
  // "visited" set for both jobs meant a diamond — A depends on B and C, both
  // of which depend on D — reported D as a cycle the second time it was
  // reached and disabled A.
  if (satisfied.has(key)) return true;
  if (chain.has(key)) return false;

  chain.add(key);
  const flag = registry.get(key);

  try {
    if (!flag || !flag.enabled) return false;
    if (!flag.dependencies || flag.dependencies.length === 0) {
      satisfied.add(key);
      return true;
    }

    for (const dep of flag.dependencies) {
      if (!resolveDependencies(dep, registry, chain, satisfied)) return false;
    }

    satisfied.add(key);
    return true;
  } finally {
    // Leaving the key in the chain would make a sibling branch see a cycle
    // that is not there.
    chain.delete(key);
  }
}

/**
 * Merge default context with provided context.
 */
export function mergeContext(
  defaultContext: FeatureFlagContext,
  context?: FeatureFlagContext,
): FeatureFlagContext {
  if (!context) return defaultContext;
  return {
    ...defaultContext,
    ...context,
    attributes: {
      ...defaultContext.attributes,
      ...context.attributes,
    },
  };
}
