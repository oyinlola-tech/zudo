import type { Module, ModuleId } from "../module.js";

import type { ModuleDefinition } from "../moduleDefinition.definition.js";

import type { ModuleMetadata } from "../moduleMetadata.metadata.js";

import type { ModuleDependency } from "../moduleDependency/moduleDependency.type.js";

/**
 * State of a module inside the registry.
 *
 * The registry records state but does not perform lifecycle
 * transitions itself.
 */
export type ModuleRegistrationState =
  "registered" | "loading" | "loaded" | "failed" | "unloaded";

/**
 * Runtime record associated with a registered module.
 */
export interface ModuleRegistration<TModule extends Module = Module> {
  /**
   * Module definition.
   */
  readonly definition: ModuleDefinition<TModule>;

  /**
   * Runtime module instance, when loaded.
   */
  readonly instance?: TModule;

  /**
   * Current registry state.
   */
  readonly state: ModuleRegistrationState;

  /**
   * Last error associated with the module.
   */
  readonly error?: unknown;

  /**
   * Time at which the module was registered.
   */
  readonly registeredAt: Date;

  /**
   * Time at which the module was loaded.
   */
  readonly loadedAt?: Date;
}

/**
 * Options used when creating a module registry.
 */
export interface ModuleRegistryOptions {
  /**
   * Whether an existing definition can be replaced.
   *
   * Defaults to false.
   */
  readonly allowReplacement?: boolean;
}

/**
 * Events emitted by the registry when its catalog changes.
 *
 * This is intentionally a lightweight callback contract.
 * The full event system belongs elsewhere in the framework.
 */
export type ModuleRegistryEventType =
  "registered" | "replaced" | "unregistered" | "state-changed";

export interface ModuleRegistryEvent {
  readonly type: ModuleRegistryEventType;

  readonly moduleId: ModuleId;

  readonly previous?: ModuleRegistration;

  readonly current?: ModuleRegistration;

  readonly timestamp: Date;
}

export type ModuleRegistryListener = (
  event: ModuleRegistryEvent,
) => void | Promise<void>;

/**
 * Options accepted when registering a module definition.
 */
export interface ModuleRegisterOptions {
  /**
   * Allows replacing a definition whose module instance is
   * already loaded (or loading).
   *
   * Replacing a loaded module strands the live instance, so it
   * is rejected with InvalidModuleStateError unless the caller
   * opts in explicitly. Replacement itself additionally requires
   * the registry's allowReplacement option.
   *
   * Defaults to false.
   */
  readonly replaceLoaded?: boolean;
}

/**
 * Public contract for the module registry.
 */
export interface ModuleRegistry {
  /**
   * Registers a module definition.
   */
  register<TModule extends Module>(
    definition: ModuleDefinition<TModule>,
    options?: ModuleRegisterOptions,
  ): ModuleRegistration<TModule>;

  /**
   * Registers multiple definitions.
   */
  registerMany(
    definitions: readonly ModuleDefinition[],
  ): readonly ModuleRegistration[];

  /**
   * Returns a module registration.
   */
  get(moduleId: ModuleId): ModuleRegistration | undefined;

  /**
   * Returns a module registration or throws.
   */
  require(moduleId: ModuleId): ModuleRegistration;

  /**
   * Checks whether a module is registered.
   */
  has(moduleId: ModuleId): boolean;

  /**
   * Removes a module definition.
   *
   * The registry does not unload the runtime instance.
   * The lifecycle system must handle that separately.
   */
  unregister(moduleId: ModuleId): boolean;

  /**
   * Returns all registered modules.
   */
  getAll(): readonly ModuleRegistration[];

  /**
   * Returns all registered module definitions.
   */
  getDefinitions(): readonly ModuleDefinition[];

  /**
   * Returns all currently loaded modules.
   */
  getLoadedModules(): readonly Module[];

  /**
   * Updates the state of a registered module.
   */
  setState(
    moduleId: ModuleId,
    state: ModuleRegistrationState,
    details?: {
      readonly instance?: Module;
      readonly error?: unknown;
    },
  ): ModuleRegistration;

  /**
   * Gets module dependencies.
   */
  getDependencies(moduleId: ModuleId): readonly ModuleDependency[];

  /**
   * Returns module metadata.
   */
  getMetadata(moduleId: ModuleId): ModuleMetadata | undefined;

  /**
   * Subscribes to registry changes.
   */
  subscribe(listener: ModuleRegistryListener): () => void;

  /**
   * Removes all registered definitions.
   */
  clear(): void;
}
