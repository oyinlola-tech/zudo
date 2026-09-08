import type { PluginMetadata } from "./pluginMetadata.type.js";

/**
 * Minimal container interface for plugin context.
 */
export interface PluginContainer {
  register(token: unknown, provider: unknown): void;
}

/**
 * Minimal config interface for plugin context.
 */
export interface PluginConfig {
  get(key: string): unknown;
}

/**
 * Minimal logger interface for plugin context.
 */
export interface PluginLogger {
  info(message: string, context?: Record<string, unknown>): void;

  warn(message: string, context?: Record<string, unknown>): void;

  error(message: string, context?: Record<string, unknown>): void;
}

/**
 * Minimal events interface for plugin context.
 */
export interface PluginEvents {
  on(event: string, handler: (event: unknown) => void): void;

  off(event: string, handler: (event: unknown) => void): void;

  emit(event: string, payload: unknown): void;
}

/**
 * Something a plugin registers so the manager releases it on shutdown.
 */
export interface PluginDisposable {
  dispose(): void | Promise<void>;
}

/**
 * Controlled context provided to plugins during lifecycle operations.
 */
export interface PluginContext {
  readonly plugin: PluginMetadata;

  readonly container?: PluginContainer;

  readonly config?: PluginConfig;

  readonly logger?: PluginLogger;

  readonly events?: PluginEvents;

  /**
   * Aborted when the plugin system shuts down, so long-lived work
   * started by the plugin can stop.
   */
  readonly signal: AbortSignal;

  onDispose(handler: () => void | Promise<void>): void;

  registerDisposable(disposable: PluginDisposable): void;
}
