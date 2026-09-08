/**
 * @zudojs/plugins
 *
 * Controlled extension system for the Zudojs framework.
 *
 * Provides plugin registration, dependency resolution, lifecycle management,
 * and orchestration for Zudojs applications.
 *
 * @example
 * ```ts
 * import { PluginManager, createPluginContext } from "@zudojs/plugins";
 *
 * const manager = new PluginManager();
 *
 * manager.register({
 *   metadata: { name: "@zudojs/http" },
 *   dependencies: [{ name: "@zudojs/events" }],
 *   async install(context) {
 *     // register services
 *   },
 *   async start(context) {
 *     // begin active work
 *   },
 * });
 *
 * await manager.start(createPluginContext({ metadata: { name: "@zudojs/http" } }));
 * ```
 */

export { PluginManager } from "./pluginManager/pluginManager.core.js";
export type { PluginManagerOptions } from "./pluginManager/pluginManager.core.js";

export { PluginRegistryImpl } from "./pluginRegistry/pluginRegistry.core.js";
export type {
  PluginRegistry,
  RegisteredPlugin,
} from "./pluginRegistry/pluginRegistry.core.js";

export {
  DependencyResolver,
  assertResolutionValid,
} from "./pluginDependencies/dependencyResolver.core.js";
export type {
  DependencyResolution,
  MissingDependency,
  ResolvablePlugin,
} from "./pluginDependencies/dependencyResolver.core.js";

export {
  parseVersion,
  compareVersions,
  satisfiesVersion,
  assertDependencyVersions,
} from "./pluginDependencies/versionCheck.core.js";

export { LifecycleController } from "./pluginLifecycle/pluginLifecycle.core.js";

export {
  PLUGIN_EVENTS,
  createPluginLifecycleEvent,
} from "./pluginEvents/pluginEvent.core.js";
export type { PluginLifecycleEvent } from "./pluginEvents/pluginEvent.core.js";

export {
  buildDiagnosticReport,
  createHealthyHealth,
  createDegradedHealth,
  createUnhealthyHealth,
} from "./pluginDiagnostics/pluginDiagnostic.core.js";
export type {
  PluginHealth,
  PluginHealthStatus,
  PluginDiagnostic,
  PluginDiagnosticReport,
} from "./pluginDiagnostics/pluginDiagnostic.core.js";

export {
  isValidTransition,
  VALID_STATE_TRANSITIONS,
} from "./pluginTypes/pluginState.type.js";

export {
  createPluginContext,
  createOwnedPluginContext,
} from "./pluginIntegration/pluginContext.core.js";
export type {
  CreatePluginContextOptions,
  OwnedPluginContext,
} from "./pluginIntegration/pluginContext.core.js";

export {
  PluginError,
  PluginRegistrationError,
  PluginAlreadyRegisteredError,
  PluginNotFoundError,
  PluginDependencyError,
  PluginDependencyCycleError,
  PluginInitializationError,
  PluginStartError,
  PluginStopError,
  PluginDisposeError,
  PluginTimeoutError,
  PluginStateError,
  createPluginError,
  isPluginError,
} from "@zudojs/errors";

export type {
  PluginState,
  PluginMetadata,
  PluginDependency,
  PluginContext,
  PluginContainer,
  PluginConfig,
  PluginLogger,
  PluginEvents,
  PluginDisposable,
  Plugin,
  PluginErrorOptions,
} from "./pluginTypes/index.js";
