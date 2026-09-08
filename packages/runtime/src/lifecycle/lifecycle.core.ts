import type { Logger } from "@zudojs/logger";

import type { ConfigurationManager, Module, ModuleContext } from "@zudojs/core";

import { createConfigurationManager } from "@zudojs/core";

import type {
  LifecycleResult,
  LifecycleFailure,
  LifecycleManagerOptions,
  ModuleContextServices,
} from "./lifecycle.type.js";

import { resolveDependencies } from "../dependencyGraph/index.js";

import {
  RuntimeDependencyError,
  RuntimeStateError,
} from "../runtimeError/index.js";

/**
 * Manages the lifecycle of runtime modules.
 */
export class LifecycleManager {
  private readonly modules: ReadonlyMap<string, Module>;
  private readonly logger: Logger;
  private readonly options: Required<LifecycleManagerOptions>;
  private initializedModules: string[] = [];
  private startedModules: string[] = [];
  private readonly configuration: ConfigurationManager;
  private readonly application: ModuleContext["application"] | undefined;
  private readonly contexts = new Map<string, ModuleContext>();

  public constructor(
    modules: ReadonlyMap<string, Module>,
    logger: Logger,
    options: LifecycleManagerOptions = {},
    services: ModuleContextServices = {},
  ) {
    this.modules = modules;
    this.logger = logger;
    this.configuration = services.configuration ?? createConfigurationManager();
    this.application = services.application;
    this.options = {
      shutdownTimeout: options.shutdownTimeout ?? 30_000,
      continueOnFailure: options.continueOnFailure ?? false,
      // Defaults to sequential: initializing a whole depth group at once
      // is a real behaviour change for modules that assume ordering
      // beyond what they declared, so it is opt-in.
      parallelInitialization: options.parallelInitialization ?? false,
    };
  }

  /**
   * Loads the configuration manager once, before modules are initialized,
   * so that `context.getConfiguration()` is usable from the first hook.
   */
  private async ensureConfigurationReady(): Promise<void> {
    if (this.configuration.isReady()) {
      return;
    }

    try {
      await this.configuration.initialize();
    } catch (error) {
      this.logger.warn("Configuration failed to load.", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Initializes all modules in dependency order.
   */
  public async initialize(): Promise<LifecycleResult> {
    const startTime = Date.now();

    // Reset the per-run bookkeeping. Appending across runs would make a
    // stop-then-start cycle initialize and stop every module twice.
    this.initializedModules = [];
    this.startedModules = [];

    await this.ensureConfigurationReady();
    const succeeded: string[] = [];
    const failed: LifecycleFailure[] = [];

    const depGraph = this.buildModuleDependencyGraph();

    // Modules within a depth group have no dependency on one another, so
    // they may be initialized together when the caller opts in.
    const groups = this.options.parallelInitialization
      ? depGraph.parallelGroups
      : depGraph.order.map((moduleId) => [moduleId] as readonly string[]);

    for (const group of groups) {
      const results = await Promise.all(
        group.map((moduleId) => this.initializeModule(moduleId)),
      );

      for (const result of results) {
        if (result.failure) {
          failed.push(result.failure);
        } else {
          succeeded.push(result.moduleId);
          this.initializedModules.push(result.moduleId);
        }
      }

      if (failed.length > 0 && !this.options.continueOnFailure) {
        break;
      }
    }

    return Object.freeze({
      phase: "initialize",
      succeeded: Object.freeze(succeeded),
      failed: Object.freeze(failed),
      durationMs: Date.now() - startTime,
    });
  }

  /**
   * Initializes a single module, converting a throw into a failure.
   */
  private async initializeModule(
    moduleId: string,
  ): Promise<{ moduleId: string; failure?: LifecycleFailure }> {
    const module = this.modules.get(moduleId);

    if (!module) {
      return {
        moduleId,
        failure: {
          moduleId,
          phase: "initialize",
          error: new RuntimeDependencyError(moduleId, "unknown"),
          durationMs: 0,
        },
      };
    }

    const startedAt = Date.now();

    try {
      if (module.onInitialize) {
        await module.onInitialize(this.createModuleContext(module));
      }

      this.logger.debug(`Module "${moduleId}" initialized.`, {
        durationMs: Date.now() - startedAt,
      });

      return { moduleId };
    } catch (error) {
      const failure: LifecycleFailure = {
        moduleId,
        phase: "initialize",
        error: error instanceof Error ? error : new Error(String(error)),
        durationMs: Date.now() - startedAt,
      };

      this.logger.error(`Module "${moduleId}" failed during initialization.`, {
        error: failure.error,
      });

      return { moduleId, failure };
    }
  }

  /**
   * Starts all modules in dependency order.
   */
  public async start(): Promise<LifecycleResult> {
    const startTime = Date.now();
    this.startedModules = [];
    const succeeded: string[] = [];
    const failed: LifecycleFailure[] = [];

    for (const moduleId of this.initializedModules) {
      const module = this.modules.get(moduleId);
      if (!module) continue;

      const moduleStartTime = Date.now();

      try {
        if (module.onReady) {
          const context = this.createModuleContext(module);
          await module.onReady(context);
        }

        succeeded.push(moduleId);
        this.startedModules.push(moduleId);

        this.logger.debug(`Module "${moduleId}" started.`, {
          durationMs: Date.now() - moduleStartTime,
        });
      } catch (error) {
        const failure: LifecycleFailure = {
          moduleId,
          phase: "start",
          error: error instanceof Error ? error : new Error(String(error)),
          durationMs: Date.now() - moduleStartTime,
        };

        failed.push(failure);

        this.logger.error(`Module "${moduleId}" failed during startup.`, {
          error: failure.error,
        });

        if (!this.options.continueOnFailure) {
          break;
        }
      }
    }

    return Object.freeze({
      phase: "start",
      succeeded: Object.freeze(succeeded),
      failed: Object.freeze(failed),
      durationMs: Date.now() - startTime,
    });
  }

  /**
   * Stops all modules in reverse dependency order.
   */
  public async stop(): Promise<LifecycleResult> {
    const startTime = Date.now();
    const succeeded: string[] = [];
    const failed: LifecycleFailure[] = [];

    const reversedModules = [...this.startedModules].reverse();

    for (const moduleId of reversedModules) {
      const module = this.modules.get(moduleId);
      if (!module) continue;

      const moduleStartTime = Date.now();

      try {
        if (module.onShutdown) {
          const context = this.createModuleContext(module);
          await module.onShutdown(context);
        }

        succeeded.push(moduleId);

        this.logger.debug(`Module "${moduleId}" stopped.`, {
          durationMs: Date.now() - moduleStartTime,
        });
      } catch (error) {
        const failure: LifecycleFailure = {
          moduleId,
          phase: "stop",
          error: error instanceof Error ? error : new Error(String(error)),
          durationMs: Date.now() - moduleStartTime,
        };

        failed.push(failure);

        this.logger.error(`Module "${moduleId}" failed during shutdown.`, {
          error: failure.error,
        });
      }
    }

    return Object.freeze({
      phase: "stop",
      succeeded: Object.freeze(succeeded),
      failed: Object.freeze(failed),
      durationMs: Date.now() - startTime,
    });
  }

  /**
   * Destroys all modules in reverse dependency order.
   */
  public async destroy(): Promise<LifecycleResult> {
    const startTime = Date.now();
    const succeeded: string[] = [];
    const failed: LifecycleFailure[] = [];

    const reversedModules = [...this.startedModules, ...this.initializedModules]
      .filter((id, index, arr) => arr.indexOf(id) === index)
      .reverse();

    for (const moduleId of reversedModules) {
      const module = this.modules.get(moduleId);
      if (!module) continue;

      const moduleStartTime = Date.now();

      try {
        if (module.onDestroy) {
          const context = this.createModuleContext(module);
          await module.onDestroy(context);
        }

        succeeded.push(moduleId);

        this.logger.debug(`Module "${moduleId}" destroyed.`, {
          durationMs: Date.now() - moduleStartTime,
        });
      } catch (error) {
        const failure: LifecycleFailure = {
          moduleId,
          phase: "destroy",
          error: error instanceof Error ? error : new Error(String(error)),
          durationMs: Date.now() - moduleStartTime,
        };

        failed.push(failure);

        this.logger.error(`Module "${moduleId}" failed during destruction.`, {
          error: failure.error,
        });
      }
    }

    // The runtime no longer owns these modules; a subsequent start
    // rebuilds the lists from scratch.
    this.startedModules = [];
    this.initializedModules = [];
    this.contexts.clear();

    return Object.freeze({
      phase: "destroy",
      succeeded: Object.freeze(succeeded),
      failed: Object.freeze(failed),
      durationMs: Date.now() - startTime,
    });
  }

  /**
   * Rolls back a failed startup.
   *
   * Started modules are shut down, and every module that reached
   * `onInitialize` is then destroyed — including those that never
   * started because an earlier module failed. Rolling back only the
   * started ones leaves everything they had already acquired behind with
   * no route to release it.
   */
  public async rollback(): Promise<readonly LifecycleFailure[]> {
    const failures: LifecycleFailure[] = [];

    for (const moduleId of [...this.startedModules].reverse()) {
      const module = this.modules.get(moduleId);
      if (!module?.onShutdown) continue;

      const startedAt = Date.now();

      try {
        await module.onShutdown(this.createModuleContext(module));
        this.logger.debug(`Module "${moduleId}" rolled back.`);
      } catch (error) {
        failures.push({
          moduleId,
          phase: "stop",
          error: error instanceof Error ? error : new Error(String(error)),
          durationMs: Date.now() - startedAt,
        });

        this.logger.error(`Module "${moduleId}" rollback failed.`, {
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    }

    for (const moduleId of [...this.initializedModules].reverse()) {
      const module = this.modules.get(moduleId);
      if (!module?.onDestroy) continue;

      const startedAt = Date.now();

      try {
        await module.onDestroy(this.createModuleContext(module));
        this.logger.debug(`Module "${moduleId}" destroyed during rollback.`);
      } catch (error) {
        failures.push({
          moduleId,
          phase: "destroy",
          error: error instanceof Error ? error : new Error(String(error)),
          durationMs: Date.now() - startedAt,
        });

        this.logger.error(`Module "${moduleId}" destruction failed.`, {
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // A rolled-back runtime owns nothing; clear the bookkeeping so a
    // later shutdown does not stop modules a second time.
    this.startedModules = [];
    this.initializedModules = [];
    this.contexts.clear();

    return failures;
  }

  /**
   * Creates a module context for lifecycle hooks.
   */
  private createModuleContext(module: Module): ModuleContext {
    const existing = this.contexts.get(module.id);

    if (existing !== undefined) {
      return existing;
    }

    const configuration = this.configuration;
    const application = this.application;
    const logger = this.logger;
    const contexts = this.contexts;
    const modules = this.modules;

    const context: ModuleContext = {
      id: module.id,
      name: module.name,
      version: module.version,
      options: module.options ?? {},
      scope: module.scope,

      // `application` is a getter so that a runtime started without an
      // application context fails loudly at the point of use, rather than
      // handing modules an empty object that lies about its type.
      get application(): ModuleContext["application"] {
        if (application === undefined) {
          throw new RuntimeStateError(
            `Module "${module.id}" accessed "context.application", but no ` +
              `ApplicationContext was supplied to the runtime.`,
          );
        }

        return application;
      },

      configuration,
      logger,

      getConfiguration: () => configuration.getConfiguration(),
      getConfig: <T = unknown>(path: string): T | undefined =>
        configuration.get<T>(path),
      requireConfig: <T = unknown>(path: string): T =>
        configuration.require<T>(path),

      // Only a module's declared dependencies are reachable. Handing
      // every module every other module's configuration and application
      // context makes the declared dependency graph advisory.
      getModuleContext: (moduleId) => {
        const allowed =
          moduleId === module.id ||
          (module.dependencies ?? []).includes(moduleId);

        return allowed ? contexts.get(moduleId) : undefined;
      },
      hasModule: (moduleId) => modules.has(moduleId),
    };

    this.contexts.set(module.id, context);

    return context;
  }

  /**
   * Builds a dependency graph from registered modules.
   */
  /**
   * Modules that reached `onInitialize`, in initialization order.
   */
  public getInitializedModules(): readonly string[] {
    return Object.freeze([...this.initializedModules]);
  }

  /**
   * Modules that reached `onReady`, in start order.
   */
  public getStartedModules(): readonly string[] {
    return Object.freeze([...this.startedModules]);
  }

  private buildModuleDependencyGraph() {
    const moduleDeps = new Map<string, readonly string[]>();

    for (const [id, module] of this.modules) {
      moduleDeps.set(id, module.dependencies ?? []);
    }

    return resolveDependencies(moduleDeps);
  }
}
