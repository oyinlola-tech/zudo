/**
 * @zudojs/plugins
 *
 * Controlled extension system for the Zudojs framework.
 *
 * Provides plugin registration, dependency resolution, lifecycle
 * management, and orchestration for Zudojs applications.
 *
 * Plugins move through `install` -> `initialize` -> `start` on the way up
 * and `stop` -> `dispose` on the way down. The manager runs each phase
 * across every plugin in dependency order, and rolls back everything it
 * brought up if any phase fails.
 *
 * @example
 * ```ts
 * import { PluginManager, createPluginContext } from "@zudojs/plugins";
 *
 * const manager = new PluginManager({ hookTimeout: 5_000 });
 *
 * manager.register({
 *   metadata: { name: "@acme/db", version: "1.0.0" },
 *   async start(context) {
 *     const pool = openPool();
 *     context.registerDisposable({ dispose: () => pool.end() });
 *   },
 * });
 *
 * manager.register({
 *   metadata: { name: "@acme/api" },
 *   dependencies: [{ name: "@acme/db", version: "^1.0.0" }],
 *   async start(context) {
 *     context.logger?.info("api started");
 *   },
 * });
 *
 * // `createPluginContext` takes the host's own metadata plus the
 * // services plugins are allowed to reach. Each plugin is handed its
 * // own view of it, naming that plugin.
 * const context = createPluginContext({ name: "@acme/host" });
 *
 * await manager.start(context); // @acme/db, then @acme/api
 * await manager.stop(context);  // reverse order; disposables released
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
export type { SemVer } from "./pluginDependencies/versionCheck.core.js";
export { PluginDependencyVersionError } from "./pluginDependencies/versionCheck.core.js";

export { LifecycleController } from "./pluginLifecycle/pluginLifecycle.core.js";
export type { LifecycleControllerOptions } from "./pluginLifecycle/pluginLifecycle.core.js";

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
