import type { Module, ModuleId } from "../module.js";
import type { ModuleDefinition } from "../moduleDefinition.definition.js";
import type {
  ModuleRegistration,
  ModuleRegistry,
} from "../moduleRegistry/index.js";
import type { ModuleLoader } from "../moduleLoader/index.js";
import {
  ModuleError,
  ModuleErrorCode,
} from "../moduleError/moduleError.base.js";
import {
  createModuleDependencyGraph,
  resolveModuleStartupOrder,
  resolveModuleShutdownOrder,
} from "../moduleDependency/index.js";
import type { ModuleDependencyGraph } from "../moduleDependency/moduleDependency.type.js";
import type {
  ModuleLifecycleOptions,
  ModuleLifecycleResult,
  ModuleLifecycleState,
  LifecycleStateMap,
} from "./moduleLifecycle.type.js";
import { ModuleLifecycleError } from "./moduleLifecycle.type.js";
import type { ContextStorage } from "../../context/provider/contextStorage.storage.js";
import { getDefaultContextStorage } from "../../context/provider/defaultContextStorage.storage.js";
import {
  ensureStateSynchronized,
  getLifecycleState,
  requireLifecycleState,
  getAllLifecycleStates,
  isModuleInitialized,
  isModuleStarted,
  isModuleDestroyed,
  executeLifecyclePhase,
} from "./moduleLifecycle.stateMachine.js";

/**
 * Module lifecycle manager.
 * Initializes, starts, stops, and destroys modules in dependency order.
 */
export class ModuleLifecycleManager {
  private readonly registry: ModuleRegistry;
  private readonly loader: ModuleLoader;
  private readonly options: Required<
    Omit<ModuleLifecycleOptions, "contextStorage">
  >;
  private readonly contextStorage: ContextStorage;
  private readonly states: LifecycleStateMap = new Map();
  private operation: Promise<void> | undefined;

  public constructor(
    registry: ModuleRegistry,
    loader: ModuleLoader,
    options: ModuleLifecycleOptions = {},
  ) {
    this.registry = registry;
    this.loader = loader;
    this.options = {
      continueOnInitializeError: options.continueOnInitializeError ?? false,
      continueOnStartError: options.continueOnStartError ?? false,
      continueOnStopError: options.continueOnStopError ?? true,
      continueOnDestroyError: options.continueOnDestroyError ?? true,
    };
    this.contextStorage = options.contextStorage ?? getDefaultContextStorage();
  }

  public async initialize(): Promise<ModuleLifecycleResult> {
    return this.runExclusive(async () => {
      ensureStateSynchronized(this.registry, this.states);
      try {
        return await executeLifecyclePhase(
          this.getStartupOrder(),
          "initialize",
          "initializing",
          "initialized",
          this.options.continueOnInitializeError,
          this.registry,
          this.loader,
          this.states,
          this.contextStorage,
        );
      } catch (error) {
        await this.rollbackAfterFailure(error, { stopFirst: false });
        throw error;
      }
    });
  }

  public async start(): Promise<ModuleLifecycleResult> {
    return this.runExclusive(async () => {
      ensureStateSynchronized(this.registry, this.states);
      try {
        return await executeLifecyclePhase(
          this.getStartupOrder(),
          "start",
          "starting",
          "started",
          this.options.continueOnStartError,
          this.registry,
          this.loader,
          this.states,
          this.contextStorage,
        );
      } catch (error) {
        await this.rollbackAfterFailure(error, { stopFirst: true });
        throw error;
      }
    });
  }

  public async stop(): Promise<ModuleLifecycleResult> {
    return this.runExclusive(async () => {
      ensureStateSynchronized(this.registry, this.states);
      return executeLifecyclePhase(
        this.getShutdownOrder(),
        "stop",
        "stopping",
        "stopped",
        this.options.continueOnStopError,
        this.registry,
        this.loader,
        this.states,
        this.contextStorage,
      );
    });
  }

  public async destroy(): Promise<ModuleLifecycleResult> {
    return this.runExclusive(async () => {
      ensureStateSynchronized(this.registry, this.states);
      return executeLifecyclePhase(
        this.getShutdownOrder(),
        "destroy",
        "destroying",
        "destroyed",
        this.options.continueOnDestroyError,
        this.registry,
        this.loader,
        this.states,
        this.contextStorage,
      );
    });
  }

  /**
   * Rolls back modules that completed earlier phases after a
   * startup failure.
   *
   * The rollback is best-effort: the already-completed subset is
   * stopped (when requested) and destroyed in reverse dependency
   * order, and any rollback errors are collected onto the
   * original ModuleLifecycleError instead of masking it.
   */
  private async rollbackAfterFailure(
    error: unknown,
    options: { readonly stopFirst: boolean },
  ): Promise<void> {
    const rollbackErrors: unknown[] = [];

    try {
      /*
       * Only modules that actually entered the startup flow are
       * rolled back; untouched modules keep their "created"
       * state and never see stop/destroy hooks here.
       */
      const touchedPhases = new Set([
        "initialized",
        "starting",
        "started",
        "stopping",
        "stopped",
        "failed",
      ]);
      const shutdownOrder = this.getShutdownOrder().filter((moduleId) => {
        const phase = getLifecycleState(moduleId, this.states)?.phase;
        return phase !== undefined && touchedPhases.has(phase);
      });

      if (options.stopFirst) {
        const stopResult = await executeLifecyclePhase(
          shutdownOrder,
          "stop",
          "stopping",
          "stopped",
          true,
          this.registry,
          this.loader,
          this.states,
          this.contextStorage,
        );
        for (const moduleId of stopResult.failed) {
          rollbackErrors.push(
            getLifecycleState(moduleId, this.states)?.error ??
              new Error(`Module "${moduleId}" failed to stop during rollback.`),
          );
        }
      }

      const destroyResult = await executeLifecyclePhase(
        shutdownOrder,
        "destroy",
        "destroying",
        "destroyed",
        true,
        this.registry,
        this.loader,
        this.states,
        this.contextStorage,
      );
      for (const moduleId of destroyResult.failed) {
        rollbackErrors.push(
          getLifecycleState(moduleId, this.states)?.error ??
            new Error(
              `Module "${moduleId}" failed to destroy during rollback.`,
            ),
        );
      }
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError);
    }

    if (error instanceof ModuleLifecycleError && rollbackErrors.length > 0) {
      error.rollbackErrors = Object.freeze([...rollbackErrors]);
    }
  }

  /**
   * Shuts down and unloads a single module.
   *
   * The module is stopped (when started) and destroyed, its
   * lifecycle state is dropped, and the loader forgets its
   * instance and context. Hook failures never abort the unload;
   * they are reported in the result and on the lifecycle state.
   *
   * A module that other loaded modules still depend on cannot be
   * unloaded; ModuleError (MODULE_OPERATION_NOT_ALLOWED) is thrown.
   */
  public async unloadModule(
    moduleId: ModuleId,
  ): Promise<ModuleLifecycleResult> {
    return this.runExclusive(async () => {
      ensureStateSynchronized(this.registry, this.states);

      const registration = this.registry.get(moduleId);
      if (!registration?.instance) {
        this.loader.unload(moduleId);
        this.states.delete(moduleId);
        return { completed: [], failed: [], skipped: [] };
      }

      const dependents = this.getLoadedDependents(moduleId);
      if (dependents.length > 0) {
        throw new ModuleError(
          `Module "${moduleId}" cannot be unloaded while loaded modules depend on it: ${dependents.join(", ")}.`,
          {
            code: ModuleErrorCode.OPERATION_NOT_ALLOWED,
            moduleId,
            metadata: { dependents },
          },
        );
      }

      const stopped = await executeLifecyclePhase(
        [moduleId],
        "stop",
        "stopping",
        "stopped",
        true,
        this.registry,
        this.loader,
        this.states,
        this.contextStorage,
      );
      const destroyed = await executeLifecyclePhase(
        [moduleId],
        "destroy",
        "destroying",
        "destroyed",
        true,
        this.registry,
        this.loader,
        this.states,
        this.contextStorage,
      );

      this.loader.unload(moduleId);
      this.states.delete(moduleId);

      return {
        completed: Object.freeze([
          ...new Set([...stopped.completed, ...destroyed.completed]),
        ]),
        failed: Object.freeze([
          ...new Set([...stopped.failed, ...destroyed.failed]),
        ]),
        skipped: Object.freeze([...stopped.skipped, ...destroyed.skipped]),
      };
    });
  }

  /**
   * Replaces a module definition, shutting down the currently
   * loaded instance first.
   *
   * The registry must allow replacement (allowReplacement: true).
   * The new definition is registered but not loaded; call the
   * loader and lifecycle methods afterwards to bring it up.
   */
  public async replaceModule<TModule extends Module>(
    definition: ModuleDefinition<TModule>,
  ): Promise<ModuleRegistration<TModule>> {
    const existing = this.registry.get(definition.id);
    if (existing?.instance) await this.unloadModule(definition.id);

    return this.registry.register(definition);
  }

  /**
   * Returns ids of loaded modules that declare a required or
   * optional dependency on the given module.
   */
  private getLoadedDependents(moduleId: ModuleId): readonly ModuleId[] {
    const dependents: ModuleId[] = [];
    for (const registration of this.registry.getAll()) {
      if (registration.definition.id === moduleId) continue;
      if (registration.state !== "loaded") continue;
      const dependsOnModule = this.registry
        .getDependencies(registration.definition.id)
        .some((dependency) => dependency.id === moduleId);
      if (dependsOnModule) dependents.push(registration.definition.id);
    }
    return dependents;
  }

  public async startApplication(): Promise<{
    readonly initialized: ModuleLifecycleResult;
    readonly started: ModuleLifecycleResult;
  }> {
    /*
     * When continueOn*Error is disabled, phase failures are
     * reported through the thrown (and rolled-back)
     * ModuleLifecycleError from initialize()/start(). That is
     * the single failure path of application startup.
     */
    const initialized = await this.initialize();
    const started = await this.start();
    return { initialized, started };
  }

  public async stopApplication(): Promise<{
    readonly stopped: ModuleLifecycleResult;
    readonly destroyed: ModuleLifecycleResult;
  }> {
    const stopped = await this.stop();
    const destroyed = await this.destroy();
    return { stopped, destroyed };
  }

  public getState(moduleId: ModuleId): ModuleLifecycleState | undefined {
    return getLifecycleState(moduleId, this.states);
  }
  public requireState(moduleId: ModuleId): ModuleLifecycleState {
    return requireLifecycleState(moduleId, this.states);
  }
  public getStates(): ReadonlyMap<ModuleId, ModuleLifecycleState> {
    return getAllLifecycleStates(this.states);
  }
  public isInitialized(moduleId: ModuleId): boolean {
    return isModuleInitialized(moduleId, this.states);
  }
  public isStarted(moduleId: ModuleId): boolean {
    return isModuleStarted(moduleId, this.states);
  }
  public isDestroyed(moduleId: ModuleId): boolean {
    return isModuleDestroyed(moduleId, this.states);
  }

  private createGraph(): ModuleDependencyGraph {
    const nodes = this.registry.getAll().map((r) => ({
      id: r.definition.id,
      dependencies: this.registry.getDependencies(r.definition.id),
      version: r.definition.version,
    }));
    return createModuleDependencyGraph(nodes);
  }

  private getStartupOrder(): readonly ModuleId[] {
    const order = resolveModuleStartupOrder(this.createGraph());
    return Object.freeze(
      order.filter((id) => this.registry.get(id)?.state === "loaded"),
    );
  }

  private getShutdownOrder(): readonly ModuleId[] {
    const order = resolveModuleShutdownOrder(this.createGraph());
    return Object.freeze(
      order.filter((id) => this.registry.get(id)?.state === "loaded"),
    );
  }

  private async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    while (this.operation) await this.operation;
    let resolveOperation: (() => void) | undefined;
    const lock = new Promise<void>((resolve) => {
      resolveOperation = resolve;
    });
    this.operation = lock;
    try {
      return await operation();
    } finally {
      resolveOperation?.();
      this.operation = undefined;
    }
  }
}

/** Creates a module lifecycle manager. */
export function createModuleLifecycleManager(
  registry: ModuleRegistry,
  loader: ModuleLoader,
  options: ModuleLifecycleOptions = {},
): ModuleLifecycleManager {
  return new ModuleLifecycleManager(registry, loader, options);
}
