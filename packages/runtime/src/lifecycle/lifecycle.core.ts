import type { Logger } from "@zudojs/logger";

import type { ConfigurationManager, Module, ModuleContext } from "@zudojs/core";

import { createConfigurationManager } from "@zudojs/core";

import type {
  LifecycleResult,
  LifecycleFailure,
  LifecycleManagerOptions,
  ModuleContextServices,
  ModuleEventListener,
} from "./lifecycle.type.js";

import type { RuntimeModuleEventType } from "../runtimeEvents/runtimeEvents.type.js";

import { createModuleEventPayload } from "../runtimeEvents/runtimeEvents.core.js";

import { resolveDependencies } from "../dependencyGraph/index.js";

import { LifecycleCancellation } from "./lifecycle.cancellation.js";

import {
  RuntimeDependencyError,
  RuntimeStartError,
  RuntimeStateError,
} from "../runtimeError/index.js";

/**
 * Manages the lifecycle of runtime modules.
 */
export class LifecycleManager {
  private readonly modules: ReadonlyMap<string, Module>;
  private readonly logger: Logger;
  private readonly options: {
    readonly continueOnFailure: boolean;
    readonly parallelInitialization: boolean;
  };
  private readonly onModuleEvent: ModuleEventListener | undefined;
  private readonly runtimeId: string;
  private initializedModules: string[] = [];
  /**
   * Modules whose `onInitialize` threw. They may have acquired resources
   * before failing, so teardown still runs their `onDestroy`, matching
   * `@zudojs/lifecycle` and `@zudojs/core`.
   */
  private failedInitializations: string[] = [];
  private startedModules: string[] = [];
  private readonly configuration: ConfigurationManager;
  private readonly application: ModuleContext["application"] | undefined;
  private readonly contexts = new Map<string, ModuleContext>();
  private readonly cancellation = new LifecycleCancellation();

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
    this.onModuleEvent = options.onModuleEvent;
    this.runtimeId = options.runtimeId ?? "";
    this.options = {
      continueOnFailure: options.continueOnFailure ?? false,
      // Defaults to sequential: initializing a whole depth group at once
      // is a real behaviour change for modules that assume ordering
      // beyond what they declared, so it is opt-in.
      parallelInitialization: options.parallelInitialization ?? false,
    };
  }

  /**
   * Publishes a per-module lifecycle event.
   *
   * A throwing listener must not fail the phase that produced the event,
   * so delivery failures are contained here.
   */
  private emitModuleEvent(
    type: RuntimeModuleEventType,
    moduleId: string,
    state: string,
    options: { readonly durationMs?: number; readonly error?: Error } = {},
  ): void {
    if (!this.onModuleEvent) {
      return;
    }

    const module = this.modules.get(moduleId);

    try {
      this.onModuleEvent(
        type,
        createModuleEventPayload(
          this.runtimeId,
          state,
          moduleId,
          module?.name ?? moduleId,
          options,
        ),
      );
    } catch (error) {
      this.logger.warn("A runtime module event listener threw.", {
        eventType: type,
        moduleId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Loads the configuration manager once, before modules are initialized,
   * so that `context.getConfiguration()` is usable from the first hook.
   */
  private async ensureConfigurationReady(): Promise<void> {
    if (this.configuration.isReady()) {
      return;
    }

    // Fail closed: a configuration that did not load must not let
    // modules initialize against partial or unvalidated state.
    try {
      await this.configuration.initialize();
    } catch (error) {
      throw new RuntimeStartError("Configuration failed to load.", {
        phase: "initialize",
        ...(error instanceof Error && { cause: error }),
      });
    }
  }

  /**
   * Abandons an in-flight startup.
   *
   * No further module hook is started, and any module whose hook is
   * still running when it settles is shut down and destroyed rather than
   * left running with no owner. Called on a startup timeout and by
   * {@link rollback}.
   */
  public cancel(): void {
    this.cancellation.cancel();
  }

  /** Whether the current startup has been abandoned by {@link cancel}. */
  public get cancelled(): boolean {
    return this.cancellation.isCancelled;
  }

  /**
   * Initializes all modules in dependency order.
   */
  public async initialize(): Promise<LifecycleResult> {
    const startTime = Date.now();

    // Reset the per-run bookkeeping. Appending across runs would make a
    // stop-then-start cycle initialize and stop every module twice.
    this.initializedModules = [];
    this.failedInitializations = [];
    this.startedModules = [];
    this.cancellation.reset();

    await this.ensureConfigurationReady();
    const succeeded: string[] = [];
    const failed: LifecycleFailure[] = [];

    const depGraph = this.buildModuleDependencyGraph();

    // Modules within a depth group have no dependency on one another, so
    // they may be initialized together when the caller opts in.
    const groups = this.options.parallelInitialization
      ? depGraph.parallelGroups
      : depGraph.order.map((moduleId) => [moduleId] as readonly string[]);

    // Ids that must not have dependents initialized on top of them:
    // modules whose own hook threw, plus modules already skipped for the
    // same reason, so the skip cascades transitively. `continueOnFailure`
    // used to consult only the failure COUNT, so a dependent of a broken
    // module was initialized, readied, and reported as started — an API
    // serving traffic against a database that never came up.
    const blocked = new Set<string>();

    for (const group of groups) {
      if (this.cancellation.isCancelled) {
        break;
      }

      const runnable: string[] = [];

      for (const moduleId of group) {
        const blocker = this.findBlockingDependency(moduleId, blocked);

        if (blocker === undefined) {
          runnable.push(moduleId);
          continue;
        }

        const failure: LifecycleFailure = {
          moduleId,
          phase: "initialize",
          error: new RuntimeStartError(
            `Module "${moduleId}" was not initialized because its ` +
              `dependency "${blocker}" failed.`,
            { phase: "initialize", failedModuleId: blocker },
          ),
          durationMs: 0,
        };

        failed.push(failure);
        blocked.add(moduleId);

        this.logger.error(
          `Module "${moduleId}" was skipped because its dependency "${blocker}" failed.`,
        );

        this.emitModuleEvent("runtime.module.failed", moduleId, "failed", {
          durationMs: 0,
          error: failure.error,
        });
      }

      const results = await Promise.all(
        runnable.map((moduleId) => this.initializeModule(moduleId)),
      );

      for (const result of results) {
        if (result.failure) {
          failed.push(result.failure);
          blocked.add(result.moduleId);
        } else if (!result.abandoned) {
          succeeded.push(result.moduleId);
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
   * Returns the first declared dependency of `moduleId` that is known to
   * have failed or been skipped, or `undefined` when none has.
   *
   * Only direct dependencies are inspected: `blocked` already contains
   * every module skipped by an earlier group, and groups are visited in
   * dependency order, so the cascade is transitive.
   */
  private findBlockingDependency(
    moduleId: string,
    blocked: ReadonlySet<string>,
  ): string | undefined {
    const dependencies = this.modules.get(moduleId)?.dependencies ?? [];
    return dependencies.find((dependency) => blocked.has(dependency));
  }

  /**
   * Initializes a single module, converting a throw into a failure.
   */
  private async initializeModule(
    moduleId: string,
  ): Promise<{
    moduleId: string;
    failure?: LifecycleFailure;
    abandoned?: boolean;
  }> {
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

    this.emitModuleEvent("runtime.module.initializing", moduleId, "initializing");

    try {
      if (module.onInitialize) {
        await this.cancellation.track(
          moduleId,
          Promise.resolve(module.onInitialize(this.createModuleContext(module))),
        );
      }

      if (this.cancellation.isCancelled) {
        await this.cancellation.release(
          module,
          this.createModuleContext(module),
          false,
          this.logger,
        );
        return { moduleId, abandoned: true };
      }

      // Recorded as soon as it succeeds, not after its whole depth group:
      // a rollback that runs while a sibling is still initializing must
      // still reach this module.
      this.initializedModules.push(moduleId);

      const durationMs = Date.now() - startedAt;

      this.logger.debug(`Module "${moduleId}" initialized.`, { durationMs });

      this.emitModuleEvent("runtime.module.initialized", moduleId, "initialized", {
        durationMs,
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

      if (this.cancellation.isCancelled) {
        await this.cancellation.release(
          module,
          this.createModuleContext(module),
          false,
          this.logger,
        );
      } else {
        this.failedInitializations.push(moduleId);
      }

      this.emitModuleEvent("runtime.module.failed", moduleId, "failed", {
        durationMs: failure.durationMs,
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

    for (const moduleId of [...this.initializedModules]) {
      const module = this.modules.get(moduleId);
      if (this.cancellation.isCancelled) break;
      if (!module) continue;

      const moduleStartTime = Date.now();

      this.emitModuleEvent("runtime.module.starting", moduleId, "starting");

      try {
        if (module.onReady) {
          const context = this.createModuleContext(module);
          await this.cancellation
            .track(moduleId, Promise.resolve(module.onReady(context)))
            .catch(async (error: unknown) => {
              if (this.cancellation.isCancelled) {
                await this.cancellation.release(module, context, false, this.logger);
              }
              throw error;
            });
        }

        if (this.cancellation.isCancelled) {
          await this.cancellation.release(
            module,
            this.createModuleContext(module),
            true,
            this.logger,
          );
          break;
        }

        succeeded.push(moduleId);
        this.startedModules.push(moduleId);

        const durationMs = Date.now() - moduleStartTime;

        this.logger.debug(`Module "${moduleId}" started.`, { durationMs });

        this.emitModuleEvent("runtime.module.started", moduleId, "started", {
          durationMs,
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

        this.emitModuleEvent("runtime.module.failed", moduleId, "failed", {
          durationMs: failure.durationMs,
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

    await this.cancellation.settle();

    const reversedModules = [...this.startedModules].reverse();

    for (const moduleId of reversedModules) {
      const module = this.modules.get(moduleId);
      if (!module) continue;

      // Removed before its hook runs, so a second stop() (for example
      // after a shutdown timeout) never calls onShutdown on it again.
      this.startedModules = this.startedModules.filter((id) => id !== moduleId);

      const moduleStartTime = Date.now();

      this.emitModuleEvent("runtime.module.stopping", moduleId, "stopping");

      try {
        if (module.onShutdown) {
          const context = this.createModuleContext(module);
          await module.onShutdown(context);
        }

        succeeded.push(moduleId);

        const durationMs = Date.now() - moduleStartTime;

        this.logger.debug(`Module "${moduleId}" stopped.`, { durationMs });

        this.emitModuleEvent("runtime.module.stopped", moduleId, "stopped", {
          durationMs,
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

        this.emitModuleEvent("runtime.module.failed", moduleId, "failed", {
          durationMs: failure.durationMs,
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

    await this.cancellation.settle();

    const reversedModules = [
      ...this.startedModules,
      ...this.initializedModules,
      ...this.failedInitializations,
    ]
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
    this.failedInitializations = [];
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

    this.cancellation.cancel();

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

    for (const moduleId of [
      ...this.initializedModules,
      ...this.failedInitializations,
    ].reverse()) {
      const module = this.modules.get(moduleId);
      // A module whose hook is still running is torn down by the
      // cancellation once that hook settles, never concurrently with it.
      if (!module?.onDestroy || this.cancellation.isRunning(moduleId)) continue;

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
    this.failedInitializations = [];
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
