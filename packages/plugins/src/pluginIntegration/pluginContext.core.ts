import type { PluginMetadata } from "../pluginTypes/pluginMetadata.type.js";
import type {
  PluginContext,
  PluginContainer,
  PluginConfig,
  PluginLogger,
  PluginEvents,
  PluginDisposable,
} from "../pluginTypes/pluginContext.type.js";

/**
 * Options for creating a plugin context.
 */
export interface CreatePluginContextOptions {
  readonly container?: PluginContainer;

  readonly config?: PluginConfig;

  readonly logger?: PluginLogger;

  readonly events?: PluginEvents;

  /**
   * Collection that receives everything the plugin registers for
   * cleanup. The plugin manager passes the registered plugin's own
   * array, which is what the lifecycle disposes; without it, anything
   * registered here would be collected and then never run.
   */
  readonly disposables?: PluginDisposable[];

  /**
   * Controller whose signal the plugin observes. The manager supplies
   * one it aborts on shutdown so plugins are told to stop.
   */
  readonly abortController?: AbortController;
}

/**
 * A plugin context together with the handles needed to tear it down.
 */
export interface OwnedPluginContext {
  readonly context: PluginContext;
  /** Everything the plugin registered for cleanup, in registration order. */
  readonly disposables: PluginDisposable[];
  /** Aborts `context.signal`. */
  readonly abort: (reason?: unknown) => void;
}

/**
 * Creates a plugin context and returns it with its teardown handles.
 *
 * The disposables array and the abort function are the two capabilities
 * a context cannot expose to its own consumer but its owner needs, so
 * they are returned alongside rather than trapped in the closure.
 */
export function createOwnedPluginContext(
  plugin: PluginMetadata,
  options: CreatePluginContextOptions = {},
): OwnedPluginContext {
  const abortController = options.abortController ?? new AbortController();
  const disposables = options.disposables ?? [];

  const context: PluginContext = {
    plugin,
    signal: abortController.signal,
    container: options.container,
    config: options.config,
    logger: options.logger,
    events: options.events,
    onDispose(handler) {
      disposables.push({ dispose: handler });
    },
    registerDisposable(disposable) {
      disposables.push(disposable);
    },
  };

  return {
    context,
    disposables,
    abort: (reason?: unknown) => {
      if (!abortController.signal.aborted) {
        abortController.abort(reason);
      }
    },
  };
}

/**
 * Creates a plugin context for testing and basic usage.
 *
 * Pass `options.disposables` to reach what the plugin registers;
 * otherwise use {@link createOwnedPluginContext}, which returns the
 * collection and the abort handle with the context.
 */
export function createPluginContext(
  plugin: PluginMetadata,
  options: CreatePluginContextOptions = {},
): PluginContext {
  return createOwnedPluginContext(plugin, options).context;
}
