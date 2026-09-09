import type { Plugin } from "../pluginTypes/plugin.type.js";
import type {
  PluginContext,
  PluginEvents,
} from "../pluginTypes/pluginContext.type.js";
import type {
  PluginRegistry,
  RegisteredPlugin,
} from "../pluginRegistry/pluginRegistry.core.js";
import type { ResolvablePlugin } from "../pluginDependencies/dependencyResolver.core.js";
import { PluginRegistryImpl } from "../pluginRegistry/pluginRegistry.core.js";
import {
  DependencyResolver,
  assertResolutionValid,
} from "../pluginDependencies/dependencyResolver.core.js";
import { assertDependencyVersions } from "../pluginDependencies/versionCheck.core.js";
import { LifecycleController } from "../pluginLifecycle/pluginLifecycle.core.js";
import { PluginError, PluginRegistrationError } from "@zudojs/errors";
import { createOwnedPluginContext } from "../pluginIntegration/pluginContext.core.js";
import { buildDiagnosticReport } from "../pluginDiagnostics/pluginDiagnostic.core.js";
import {
  PLUGIN_EVENTS,
  createPluginLifecycleEvent,
} from "../pluginEvents/pluginEvent.core.js";
import type { PluginDiagnosticReport } from "../pluginDiagnostics/pluginDiagnostic.core.js";

/**
 * States from which a plugin still owns resources that must be released.
 */
const DISPOSABLE_STATES = new Set([
  "installed",
  "initialized",
  "stopped",
  "failed",
]);

/**
 * Options for a plugin manager.
 */
export interface PluginManagerOptions {
  /**
   * Whether declared dependency versions are enforced at startup.
   * Defaults to `true`. A declared version that is never checked is
   * worse than no version at all.
   */
  readonly checkVersions?: boolean;
  /**
   * Receives errors raised during shutdown. Teardown continues past a
   * failing plugin either way, but without this the failures are
   * invisible.
   */
  readonly onError?: (error: unknown, pluginName: string) => void;
  /**
   * Maximum time a single lifecycle hook may run, in milliseconds.
   * Defaults to `0` (unbounded). Set a value so one hanging plugin
   * cannot hang boot or shutdown.
   */
  readonly hookTimeout?: number;
  /**
   * Capabilities plugins are permitted to declare.
   *
   * When set, a plugin whose `metadata.capabilities` includes anything
   * outside this list is rejected at registration. Leave unset to allow
   * any capability.
   */
  readonly allowedCapabilities?: readonly string[];
  /**
   * Event sink for `plugin:registered`.
   *
   * Registration happens before any plugin context exists, so the
   * lifecycle events emitted through `context.events` cannot cover it.
   * Without this, `PLUGIN_EVENTS.REGISTERED` was a name nothing ever
   * emitted.
   */
  readonly events?: PluginEvents;
}

/**
 * Plugin manager coordinates registration, dependency resolution, lifecycle, and disposal.
 */
export class PluginManager {
  private readonly registry: PluginRegistry;

  private readonly resolver: DependencyResolver;

  private readonly lifecycle: LifecycleController;

  private readonly plugins: Map<string, Plugin> = new Map();

  private readonly options: PluginManagerOptions;

  /**
   * Dependency-first order from the last successful resolution.
   *
   * Shutdown reverses this rather than registration order: tearing down
   * in registration order destroys a dependency while its dependents are
   * still using it.
   */
  private startupOrder: readonly string[] = [];

  private starting = false;

  /**
   * Per-plugin context views and their abort handles.
   *
   * Each plugin gets a context whose `onDispose` and
   * `registerDisposable` write to that plugin's own disposables list —
   * the list the lifecycle actually drains — and whose `signal` this
   * manager aborts on shutdown.
   */
  private readonly contexts = new Map<
    string,
    { context: PluginContext; abort: (reason?: unknown) => void }
  >();

  public constructor(options: PluginManagerOptions = {}) {
    this.registry = new PluginRegistryImpl();
    this.resolver = new DependencyResolver();
    this.lifecycle = new LifecycleController(
      options.hookTimeout !== undefined
        ? { hookTimeout: options.hookTimeout }
        : {},
    );
    this.options = options;
  }

  /**
   * Registers a plugin.
   *
   * @throws {PluginAlreadyRegisteredError} when the name is taken, so
   * callers can implement idempotent registration.
   */
  public register<TPlugin extends Plugin>(
    plugin: TPlugin,
    options?: unknown,
  ): void {
    if (
      typeof plugin?.metadata?.name !== "string" ||
      plugin.metadata.name.length === 0
    ) {
      throw new PluginRegistrationError(
        "Plugin metadata must include a non-empty name.",
      );
    }

    const allowed = this.options.allowedCapabilities;

    if (allowed) {
      const requested = plugin.metadata.capabilities ?? [];
      const denied = requested.filter(
        (capability) => !allowed.includes(capability),
      );

      if (denied.length > 0) {
        throw new PluginRegistrationError(
          `Plugin "${plugin.metadata.name}" requests capabilities that are not granted: ${denied.join(", ")}.`,
          plugin.metadata.name,
        );
      }
    }

    try {
      this.registry.register(plugin, options as never);
      this.plugins.set(plugin.metadata.name, plugin);
      this.emitRegistered(plugin);
    } catch (error) {
      // Typed plugin errors already say what went wrong and let callers
      // branch on the cause; only unexpected failures are wrapped.
      if (error instanceof PluginError) {
        throw error;
      }

      throw new PluginRegistrationError(
        error instanceof Error ? error.message : String(error),
        plugin.metadata.name,
      );
    }
  }

  /**
   * Removes a plugin that has not been started.
   *
   * Keeps the manager's own view in step with the registry; leaving a
   * removed plugin in `plugins` would keep it in dependency resolution.
   */
  public unregister(name: string): boolean {
    const removed = this.registry.remove(name);

    if (removed) {
      this.plugins.delete(name);
    }

    return removed;
  }

  public get<TPlugin extends Plugin>(name: string): TPlugin | undefined {
    return this.registry.get<TPlugin>(name)?.plugin;
  }

  public has(name: string): boolean {
    return this.registry.has(name);
  }

  public list(): readonly Plugin[] {
    return this.registry.list().map((r) => r.plugin);
  }

  /**
   * Installs, initializes and starts every plugin in dependency order.
   *
   * A failure anywhere rolls back: everything already brought up is
   * stopped and disposed before the error is rethrown, so an aborted
   * startup does not strand resources with no route to release them.
   */
  public async start(context: PluginContext): Promise<void> {
    if (this.starting) {
      throw new PluginRegistrationError(
        "Plugin manager start is already in progress.",
      );
    }

    this.starting = true;

    try {
      const resolution = this.resolver.resolve(this.toDependencyMap());
      assertResolutionValid(resolution);

      if (this.options.checkVersions ?? true) {
        assertDependencyVersions(this.plugins);
      }

      this.startupOrder = resolution.ordered;

      try {
        for (const name of this.startupOrder) {
          const registered = this.registry.get(name);
          if (!registered || registered.state === "disposed") continue;

          // Guarded so a restart — where plugins are already installed
          // and merely stopped — re-runs only the phases it needs.
          if (registered.state === "registered") {
            await this.lifecycle.install(
              registered,
              this.contextFor(registered, context),
            );
          }
        }

        for (const name of this.startupOrder) {
          const registered = this.registry.get(name);
          if (!registered || registered.state === "disposed") continue;

          if (registered.state === "installed") {
            await this.lifecycle.initialize(
              registered,
              this.contextFor(registered, context),
            );
          }
        }

        for (const name of this.startupOrder) {
          const registered = this.registry.get(name);
          if (!registered || registered.state === "disposed") continue;

          if (
            registered.state === "initialized" ||
            registered.state === "stopped"
          ) {
            await this.lifecycle.start(
              registered,
              this.contextFor(registered, context),
            );
          }
        }
      } catch (error) {
        await this.rollback(context);
        throw error;
      }
    } finally {
      this.starting = false;
    }
  }

  /**
   * Stops and disposes every plugin, in reverse dependency order.
   *
   * Teardown continues past a failing plugin so one bad `stop` cannot
   * strand the rest, and every failure is reported through `onError`
   * rather than swallowed.
   */
  public async stop(context: PluginContext): Promise<void> {
    for (const registered of this.teardownOrder()) {
      if (registered.state !== "started") continue;

      try {
        await this.lifecycle.stop(
          registered,
          this.contextFor(registered, context),
        );
      } catch (error) {
        this.report(error, registered.plugin.metadata.name);
      }
    }

    for (const registered of this.teardownOrder()) {
      // Anything that still holds resources is disposed, including
      // plugins that were installed or initialized but never started
      // because an earlier plugin failed.
      if (!DISPOSABLE_STATES.has(registered.state)) continue;

      const name = registered.plugin.metadata.name;

      try {
        // Abort first so work the plugin started sees the shutdown
        // before its disposables are released underneath it.
        this.abortContext(name);
        await this.lifecycle.dispose(
          registered,
          this.contextFor(registered, context),
        );
      } catch (error) {
        this.report(error, name);
      } finally {
        this.contexts.delete(name);
      }
    }
  }

  public diagnostics(): PluginDiagnosticReport {
    const plugins = this.registry.list().map((registered) => ({
      plugin: registered.plugin,
      state: registered.state,
      failed: registered.failed,
      error: registered.error,
    }));

    return buildDiagnosticReport(plugins);
  }

  /**
   * Tears down everything brought up by a failed startup.
   */
  private async rollback(context: PluginContext): Promise<void> {
    for (const registered of this.teardownOrder()) {
      if (registered.state === "started") {
        try {
          await this.lifecycle.stop(
            registered,
            this.contextFor(registered, context),
          );
        } catch (error) {
          this.report(error, registered.plugin.metadata.name);
        }
      }
    }

    for (const registered of this.teardownOrder()) {
      if (!DISPOSABLE_STATES.has(registered.state)) continue;

      const name = registered.plugin.metadata.name;

      try {
        this.abortContext(name);
        await this.lifecycle.dispose(
          registered,
          this.contextFor(registered, context),
        );
      } catch (error) {
        this.report(error, name);
      } finally {
        this.contexts.delete(name);
      }
    }
  }

  /**
   * Registered plugins in reverse dependency order.
   *
   * Falls back to reverse registration order for plugins registered
   * after the last resolution, which is the best available guess.
   */
  private teardownOrder(): readonly RegisteredPlugin[] {
    const seen = new Set<string>();
    const ordered: RegisteredPlugin[] = [];

    for (let i = this.startupOrder.length - 1; i >= 0; i -= 1) {
      const name = this.startupOrder[i]!;
      const registered = this.registry.get(name);
      if (registered) {
        seen.add(name);
        ordered.push(registered);
      }
    }

    const remaining = this.registry
      .list()
      .filter((registered) => !seen.has(registered.plugin.metadata.name))
      .reverse();

    return [...ordered, ...remaining];
  }

  /**
   * Returns the plugin's own context view, creating it on first use.
   *
   * The base context supplies the shared services; only the identity,
   * the disposables collection and the abort signal are per-plugin.
   */
  private contextFor(
    registered: RegisteredPlugin,
    base: PluginContext,
  ): PluginContext {
    const name = registered.plugin.metadata.name;
    const existing = this.contexts.get(name);

    if (existing) {
      return existing.context;
    }

    const owned = createOwnedPluginContext(registered.plugin.metadata, {
      container: base.container,
      config: base.config,
      logger: base.logger,
      events: base.events,
      disposables: registered.disposables,
    });

    this.contexts.set(name, { context: owned.context, abort: owned.abort });

    return owned.context;
  }

  /**
   * Aborts a plugin's signal, keeping the context available.
   *
   * The entry stays so `dispose` still receives the same — now aborted —
   * context; removing it here would hand the dispose hook a fresh
   * context whose signal had never fired.
   */
  private abortContext(name: string, reason?: unknown): void {
    this.contexts.get(name)?.abort(reason);
  }

  /**
   * Emits `plugin:registered`, containing a throwing subscriber so a bad
   * listener cannot fail the registration that triggered it.
   */
  private emitRegistered(plugin: Plugin): void {
    const events = this.options.events;

    if (!events) {
      return;
    }

    try {
      events.emit(
        PLUGIN_EVENTS.REGISTERED,
        createPluginLifecycleEvent(plugin.metadata, "registered"),
      );
    } catch (error) {
      this.report(error, plugin.metadata.name);
    }
  }

  private report(error: unknown, pluginName: string): void {
    if (this.options.onError) {
      this.options.onError(error, pluginName);
      return;
    }

    queueMicrotask(() => {
      console.error(
        `[@zudojs/plugins] Plugin "${pluginName}" failed during teardown.`,
        error,
      );
    });
  }

  private toDependencyMap(): Map<string, ResolvablePlugin> {
    const map = new Map<string, ResolvablePlugin>();

    for (const [name, plugin] of this.plugins) {
      map.set(name, {
        dependencies: plugin.dependencies,
        optionalDependencies: plugin.optionalDependencies,
      });
    }

    return map;
  }
}
