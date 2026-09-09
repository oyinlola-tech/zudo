import type { PluginMetadata } from "../pluginTypes/pluginMetadata.type.js";
import type { PluginState } from "../pluginTypes/pluginState.type.js";

/**
 * Event payload for plugin lifecycle events.
 */
export interface PluginLifecycleEvent {
  readonly plugin: PluginMetadata;

  readonly state: PluginState;

  readonly previousState?: PluginState;

  readonly timestamp: number;

  readonly error?: unknown;
}

/**
 * Event names emitted during plugin lifecycle.
 */
export const PLUGIN_EVENTS = {
  REGISTERED: "plugin:registered",
  INSTALLING: "plugin:installing",
  INSTALLED: "plugin:installed",
  INITIALIZING: "plugin:initializing",
  INITIALIZED: "plugin:initialized",
  STARTING: "plugin:starting",
  STARTED: "plugin:started",
  STOPPING: "plugin:stopping",
  STOPPED: "plugin:stopped",
  FAILED: "plugin:failed",
  DISPOSING: "plugin:disposing",
  DISPOSED: "plugin:disposed",
} as const;

/**
 * Creates a plugin lifecycle event.
 */
export function createPluginLifecycleEvent(
  plugin: PluginMetadata,
  state: PluginState,
  previousState?: PluginState,
  error?: unknown,
): PluginLifecycleEvent {
  return {
    plugin,
    state,
    ...(previousState !== undefined ? { previousState } : {}),
    timestamp: Date.now(),
    ...(error !== undefined ? { error } : {}),
  };
}
