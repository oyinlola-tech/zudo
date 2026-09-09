/**
 * Module dependency graph and resolution.
 */

export {
  buildDependencyGraph,
  resolveDependencies,
  validateDependencies,
} from "./dependencyGraph.core.js";

export type {
  DependencyNode,
  DependencyGraph,
  DependencyResolutionResult,
  CircularDependencyInfo,
} from "./dependencyGraph.type.js";
