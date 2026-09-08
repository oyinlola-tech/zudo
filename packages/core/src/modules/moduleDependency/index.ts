/**
 * Module Dependency Graph
 *
 * Dependency graph types, validation, and topological ordering
 * for module dependency resolution.
 */

export {
  type ModuleDependency,
  type ModuleDependencies,
  type ModuleDependencyNode,
  type ModuleDependencyGraph,
  type ModuleDependencyInput,
  type ModuleDependencyNodeInput,
} from "./moduleDependency.type.js";

export {
  normalizeModuleDependency,
  normalizeModuleDependencies,
  validateModuleDependencies,
  validateModuleDependencyGraph,
  createModuleDependencyGraph,
  createModuleDependency,
  isOptionalModuleDependency,
  hasModuleVersionConstraint,
  satisfiesModuleVersionConstraint,
} from "./moduleDependency.graph.js";

export {
  findModuleDependencyCycle,
  hasModuleDependencyCycle,
  resolveModuleStartupOrder,
  resolveModuleShutdownOrder,
} from "./moduleDependency.ordering.js";
