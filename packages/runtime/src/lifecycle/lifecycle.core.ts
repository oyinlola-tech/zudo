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
  private readonly initializedModules: string[] = [];
  private readonly startedModules: string[] = [];
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
      parallelInitialization: options.parallelInitialization ?? true,
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

    await this.ensureConfigurationReady();
    const succeeded: string[] = [];
    const failed: LifecycleFailure[] = [];

    const depGraph = this.buildModuleDependencyGraph();

    for (const moduleId of depGraph.order) {
      const module = this.modules.get(moduleId);
      if (!module) {
        failed.push({
          moduleId,
          phase: "initialize",
          error: new RuntimeDependencyError(moduleId, "unknown"),
          durationMs: 0,
        });
        continue;
      }

      const moduleStartTime = Date.now();

      try {
        if (module.onInitialize) {
          const context = this.createModuleContext(module);
          await module.onInitialize(context);
        }

        succeeded.push(moduleId);
        this.initializedModules.push(moduleId);

        this.logger.debug(`Module "${moduleId}" initialized.`, {
          durationMs: Date.now() - moduleStartTime,
        });
      } catch (error) {
        const failure: LifecycleFailure = {
          moduleId,
          phase: "initialize",
          error: error instanceof Error ? error : new Error(String(error)),
          durationMs: Date.now() - moduleStartTime,
        };

        failed.push(failure);

        this.logger.error(
          `Module "${moduleId}" failed during initialization.`,
          { error: failure.error },
        );

        if (!this.options.continueOnFailure) {
          break;
        }
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
   * Starts all modules in dependency order.
   */
  public async start(): Promise<LifecycleResult> {
    const startTime = Date.now();
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

    return Object.freeze({
      phase: "destroy",
      succeeded: Object.freeze(succeeded),
      failed: Object.freeze(failed),
      durationMs: Date.now() - startTime,
    });
  }

  /**
   * Rolls back initialization for modules that were started.
   */
  public async rollback(): Promise<void> {
    const reversedModules = [...this.startedModules].reverse();

    for (const moduleId of reversedModules) {
      const module = this.modules.get(moduleId);
      if (!module?.onShutdown) continue;

      try {
        const context = this.createModuleContext(module);
        await module.onShutdown(context);

        this.logger.debug(`Module "${moduleId}" rolled back.`);
      } catch (error) {
        this.logger.error(`Module "${moduleId}" rollback failed.`, {
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    }
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

      getModuleContext: (moduleId) => contexts.get(moduleId),
      hasModule: (moduleId) => modules.has(moduleId),
    };

    this.contexts.set(module.id, context);

    return context;
  }

  /**
   * Builds a dependency graph from registered modules.
   */
  private buildModuleDependencyGraph() {
    const moduleDeps = new Map<string, readonly string[]>();

    for (const [id, module] of this.modules) {
      moduleDeps.set(id, module.dependencies ?? []);
    }

    return resolveDependencies(moduleDeps);
  }
}
