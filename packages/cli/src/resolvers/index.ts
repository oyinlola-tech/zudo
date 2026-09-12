/**
 * zudojs-cli — Resolvers
 *
 * Architecture and project resolution utilities.
 */

export { detectArchitecture } from "./architecture.resolver.js";
export { resolveProjectPath, findProjectRoot } from "./project.resolver.js";
export {
  CapabilityResolver,
  type CapabilityDependency,
  type CapabilityResolutionResult,
} from "./capability/index.js";
export {
  ConfigurationResolver,
  type ResolvedConfiguration,
} from "./configuration/index.js";
export {
  resolveProjectLayout,
  detectPackageManager,
  type ProjectLayout,
  type ProjectLayoutType,
  type ProjectLayoutSource,
} from "./layout/index.js";
