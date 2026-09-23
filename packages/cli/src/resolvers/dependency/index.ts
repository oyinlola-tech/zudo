/**
 * Dependency resolver for compatible package versions.
 *
 * @module resolvers/dependency
 */

export {
  DependencyResolver,
  type DependencyResolutionResult,
  type ResolvedDependency,
  type DependencyConflict,
} from "./dependencyResolver.core.js";
export {
  ANGULAR_VITEST_VERSION_RANGE,
  DEFAULT_DEPENDENCY_VERSIONS,
  DEPENDENCY_VERSION_RANGES,
  TYPESCRIPT_VERSION_RANGES,
} from "./dependencyVersions.constant.js";
