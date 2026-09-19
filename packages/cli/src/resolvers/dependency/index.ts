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
export { DEFAULT_DEPENDENCY_VERSIONS } from "./dependencyVersions.constant.js";
