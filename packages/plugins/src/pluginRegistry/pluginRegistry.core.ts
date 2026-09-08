import type { Plugin } from "../pluginTypes/plugin.type.js";
import type { PluginMetadata } from "../pluginTypes/pluginMetadata.type.js";
import type { PluginDependency } from "../pluginTypes/pluginDependency.type.js";
import type { PluginState } from "../pluginTypes/pluginState.type.js";
import type { PluginDisposable } from "../pluginTypes/pluginContext.type.js";
import { PluginAlreadyRegisteredError, PluginStateError } from "@zudojs/errors";

/**
 * Internal representation of a registered plugin.
 */
export interface RegisteredPlugin<TPlugin extends Plugin = Plugin> {
  readonly plugin: TPlugin;

  state: PluginState;

  readonly options?: unknown;

  readonly disposables: PluginDisposable[];

  /**
   * Whether this plugin failed at any point in its lifecycle.
   *
   * Tracked separately from `state` because a failed plugin is disposed
   * during rollback, which would otherwise erase every trace of the
   * failure from diagnostics.
   */
  failed: boolean;

  /** The error that caused the failure, if any. */
  error?: unknown;

  registerDisposable(disposable: PluginDisposable): void;

  setState(state: PluginState): void;

  /** Records a lifecycle failure. */
  setError(error: unknown): void;
}

/**
 * Plugin registry interface.
 */
export interface PluginRegistry {
  register<TPlugin extends Plugin>(
    plugin: TPlugin,
    options?: TPlugin extends Plugin<infer TOptions> ? TOptions : unknown,
  ): void;

  get<TPlugin extends Plugin>(
    name: string,
  ): RegisteredPlugin<TPlugin> | undefined;

  has(name: string): boolean;

  list(): readonly RegisteredPlugin[];

  remove(name: string): boolean;

  clear(): void;
}

/**
 * Default plugin registry implementation.
 */
export class PluginRegistryImpl implements PluginRegistry {
  private readonly plugins: Map<string, RegisteredPlugin> = new Map();

  public register<TPlugin extends Plugin>(
    plugin: TPlugin,
    options?: TPlugin extends Plugin<infer TOptions> ? TOptions : unknown,
  ): void {
    const name = plugin.metadata.name;

    if (this.plugins.has(name)) {
      throw new PluginAlreadyRegisteredError(name);
    }

    const disposables: PluginDisposable[] = [];

    const registered: RegisteredPlugin<TPlugin> = {
      plugin,
      state: "registered",
      options,
      disposables,
      failed: false,
      registerDisposable(disposable) {
        disposables.push(disposable);
      },
      setState(state) {
        registered.state = state;
      },
      setError(error) {
        registered.failed = true;
        registered.error = error;
      },
    };

    this.plugins.set(name, registered);
  }

  public get<TPlugin extends Plugin>(
    name: string,
  ): RegisteredPlugin<TPlugin> | undefined {
    return this.plugins.get(name) as RegisteredPlugin<TPlugin> | undefined;
  }

  public has(name: string): boolean {
    return this.plugins.has(name);
  }

  public list(): readonly RegisteredPlugin[] {
    return Object.freeze(Array.from(this.plugins.values()));
  }

  public remove(name: string): boolean {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      return false;
    }

    if (plugin.state !== "registered" && plugin.state !== "disposed") {
      throw new PluginStateError(name, plugin.state, "disposed");
    }

    this.plugins.delete(name);
    return true;
  }

  public clear(): void {
    this.plugins.clear();
  }
}
