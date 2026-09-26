import type { Plugin } from "../pluginTypes/plugin.type.js";
import type {
  PluginHealth,
  PluginHealthStatus,
} from "../pluginTypes/plugin.type.js";
import type { PluginMetadata } from "../pluginTypes/pluginMetadata.type.js";
import type { PluginState } from "../pluginTypes/pluginState.type.js";

import {
  createDegradedHealth,
  createHealthyHealth,
  createUnhealthyHealth,
  resolvePluginHealth,
} from "./pluginDiagnostic.health.js";

export type { PluginHealth, PluginHealthStatus };
export {
  createDegradedHealth,
  createHealthyHealth,
  createUnhealthyHealth,
  resolvePluginHealth,
};

/**
 * Individual plugin diagnostic information.
 */
export interface PluginDiagnostic {
  readonly plugin: PluginMetadata;

  readonly state: PluginState;

  /** Whether the plugin failed at any point in its lifecycle. */
  readonly failed: boolean;

  readonly health: PluginHealth;

  readonly dependencies: readonly string[];

  readonly optionalDependencies: readonly string[];
}

/**
 * Complete plugin system diagnostic report.
 */
export interface PluginDiagnosticReport {
  readonly plugins: readonly PluginDiagnostic[];

  readonly total: number;

  readonly healthy: number;

  readonly degraded: number;

  readonly unhealthy: number;

  readonly failed: number;
}

/**
 * Builds a diagnostic report from registered plugins.
 */
export function buildDiagnosticReport(
  plugins: Array<{
    readonly plugin: Plugin;
    readonly state: PluginState;
    /**
     * Whether the plugin failed at any point. A plugin that failed and
     * was then disposed during rollback is still a failure worth
     * reporting, which its current state alone would not show.
     */
    readonly failed?: boolean;
    readonly error?: unknown;
  }>,
): PluginDiagnosticReport {
  const pluginDiagnostics: PluginDiagnostic[] = plugins.map(
    ({ plugin, state, failed, error }) => {
      const hasFailed = failed === true || state === "failed";

      return {
        plugin: plugin.metadata,
        state,
        failed: hasFailed,
        health: resolvePluginHealth(plugin, state, hasFailed, error),
        dependencies: plugin.dependencies?.map((d) => d.name) ?? [],
        optionalDependencies:
          plugin.optionalDependencies?.map((d) => d.name) ?? [],
      };
    },
  );

  const healthy = pluginDiagnostics.filter(
    (d) => d.health.status === "healthy",
  ).length;
  const degraded = pluginDiagnostics.filter(
    (d) => d.health.status === "degraded",
  ).length;
  const unhealthy = pluginDiagnostics.filter(
    (d) => d.health.status === "unhealthy",
  ).length;
  const failed = pluginDiagnostics.filter((d) => d.failed).length;

  return {
    plugins: Object.freeze(pluginDiagnostics),
    total: pluginDiagnostics.length,
    healthy,
    degraded,
    unhealthy,
    failed,
  };
}
