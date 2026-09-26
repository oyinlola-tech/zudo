import type { PluginMetadata } from "./pluginMetadata.type.js";

/**
 * Minimal container interface for plugin context.
 *
 * `register` is all the plugin system itself needs. `resolve` and `has`
 * are declared optional so a plugin can read from a real container
 * (`@zudojs/container`'s satisfies this shape) without casting; a host
 * that passes a register-only object leaves them `undefined`.
 */
export interface PluginContainer {
  register(token: unknown, provider: unknown): void;

  resolve?<T = unknown>(token: unknown): T;

  has?(token: unknown): boolean;
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
 *
 * `emit` may return a promise. A rejection is contained and reported, just
 * like a synchronous throw — it never fails the phase that emitted.
 */
export interface PluginEvents {
  on(event: string, handler: (event: unknown) => void): void;

  off(event: string, handler: (event: unknown) => void): void;

  emit(event: string, payload: unknown): void | PromiseLike<unknown>;
}

/**
 * The part of an event bus the plugin system uses — satisfied by
 * `@zudojs/events`' `EventBus`, which can be passed wherever
 * {@link PluginEventSource} is accepted.
 */
export interface PluginEventBus {
  publishEvent(input: {
    readonly type: string;
    readonly payload: unknown;
  }): Promise<unknown>;

  on(
    eventType: string,
    handler: (event: { readonly payload: unknown }) => unknown,
  ): { unsubscribe(): void };
}

/**
 * What the plugin system accepts as an event source: a
 * {@link PluginEvents} sink, or an event bus it adapts with
 * `toPluginEvents`.
 */
export type PluginEventSource = PluginEvents | PluginEventBus;

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

  /**
   * Metadata of the host application — the `plugin` metadata of the
   * context handed to `PluginManager.start()`. Absent on a context built
   * directly with `createPluginContext` and no `host` option.
   */
  readonly host?: PluginMetadata;

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
