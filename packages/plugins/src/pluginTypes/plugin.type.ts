import type { PluginMetadata } from "./pluginMetadata.type.js";
import type { PluginDependency } from "./pluginDependency.type.js";
import type { PluginContext } from "./pluginContext.type.js";

/**
 * Plugin health status.
 */
export type PluginHealthStatus = "healthy" | "degraded" | "unhealthy";

/**
 * Plugin health information: what a plugin's own `health()` returns and
 * what `PluginManager.diagnostics()` reports for it.
 */
export interface PluginHealth {
  readonly status: PluginHealthStatus;

  readonly details?: unknown;
}

/**
 * Plugin interface definition.
 */
export interface Plugin<TOptions = unknown> {
  readonly metadata: PluginMetadata;

  readonly dependencies?: readonly PluginDependency[];

  readonly optionalDependencies?: readonly PluginDependency[];

  install?(context: PluginContext, options: TOptions): void | Promise<void>;

  initialize?(context: PluginContext): void | Promise<void>;

  start?(context: PluginContext): void | Promise<void>;

  stop?(context: PluginContext): void | Promise<void>;

  dispose?(context: PluginContext): void | Promise<void>;

  /**
   * Reports the plugin's own health while it is `started`. Consulted by
   * `PluginManager.diagnostics()`, which otherwise derives health from
   * lifecycle state alone; a throwing `health()` is reported as
   * `unhealthy` with the error message as `details`.
   */
  health?(): PluginHealth;
}
