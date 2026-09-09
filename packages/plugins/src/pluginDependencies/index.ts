/**
 * @zudojs/plugins/pluginDependencies
 *
 * Plugin dependency resolution, topological sorting, cycle detection,
 * and version constraint checking.
 */

export type {
  DependencyResolution,
  MissingDependency,
  ResolvablePlugin,
} from "./dependencyResolver.core.js";

export {
  DependencyResolver,
  assertResolutionValid,
} from "./dependencyResolver.core.js";

export type { SemVer } from "./versionCheck.core.js";

export { PluginDependencyVersionError } from "./versionCheck.core.js";

export {
  parseVersion,
  compareVersions,
  satisfiesVersion,
  assertDependencyVersions,
} from "./versionCheck.core.js";
