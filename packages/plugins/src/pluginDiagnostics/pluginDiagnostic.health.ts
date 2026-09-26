/**
 * Health resolution for one plugin, from its lifecycle state and its own
 * `health()` hook.
 *
 * @module pluginDiagnostics/pluginDiagnostic.health
 */

import type { Plugin } from "../pluginTypes/plugin.type.js";
import type { PluginHealth } from "../pluginTypes/plugin.type.js";
import type { PluginState } from "../pluginTypes/pluginState.type.js";

/**
 * States in which a plugin is between two settled states, or brought
 * part-way up by a `start()` that has not finished.
 */
const IN_PROGRESS_STATES: ReadonlySet<PluginState> = new Set([
  "installing",
  "installed",
  "initializing",
  "initialized",
  "starting",
  "stopping",
  "disposing",
]);

/**
 * Creates a default healthy status for a plugin.
 */
export function createHealthyHealth(): PluginHealth {
  return { status: "healthy" };
}

/**
 * Creates a degraded health status for a plugin.
 */
export function createDegradedHealth(details?: unknown): PluginHealth {
  return { status: "degraded", ...(details !== undefined ? { details } : {}) };
}

/**
 * Creates an unhealthy health status for a plugin.
 */
export function createUnhealthyHealth(details?: unknown): PluginHealth {
  return { status: "unhealthy", ...(details !== undefined ? { details } : {}) };
}

/**
 * Health of one plugin.
 *
 * A failed plugin is `unhealthy`. A started plugin answers with its own
 * `health()` when it has one (a throwing `health()` is `unhealthy`), else
 * `healthy`. A plugin part-way through boot or a transition is `degraded`.
 * A plugin that is idle — `registered`, or cleanly `stopped` or `disposed`
 * — is `healthy`: before this rule every plugin read `degraded` after a
 * clean `stop()`, which made the report useless during shutdown.
 */
export function resolvePluginHealth(
  plugin: Plugin,
  state: PluginState,
  failed: boolean,
  error?: unknown,
): PluginHealth {
  if (failed) {
    return createUnhealthyHealth(error instanceof Error ? error.message : error);
  }

  if (state === "started") {
    if (typeof plugin.health !== "function") return createHealthyHealth();
    try {
      return plugin.health();
    } catch (cause) {
      return createUnhealthyHealth(cause instanceof Error ? cause.message : cause);
    }
  }

  return IN_PROGRESS_STATES.has(state)
    ? createDegradedHealth({ state })
    : createHealthyHealth();
}
