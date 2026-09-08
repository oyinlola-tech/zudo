import type { ApplicationContext } from "../application/applicationContext.context.js";

import type { ConfigurationManager } from "../configuration/configurationManager.manager.js";

import type { Configuration } from "../configuration/core/configuration.js";

import type { Logger } from "../logging/core/logger.js";

import type { LifecycleScope } from "../lifecycle/scope/lifecycleScope.scope.js";

import type { Module, ModuleId, ModuleOptions } from "./module.js";

import { deepFreezeModuleOptions } from "./moduleDefinition.definition.js";

import type { ModuleMetadata } from "./moduleMetadata.metadata.js";

import { MissingModuleDependencyError } from "./moduleError/moduleError.dependency.js";

/**
 * Dependencies exposed to a module through its context.
 *
 * This is intentionally a narrow interface. The module should
 * receive capabilities, not unrestricted access to the runtime.
 */
export interface ModuleContextDependencies {
  /**
   * Application context.
   */
  readonly application: ApplicationContext;

  /**
   * Configuration manager.
   */
  readonly configuration: ConfigurationManager;

  /**
   * Module-scoped logger.
   */
  readonly logger: Logger;
}

/**
 * Immutable information describing the current module.
 */
export interface ModuleContextInfo {
  /**
   * Module identifier.
   */
  readonly id: ModuleId;

  /**
   * Module name.
   */
  readonly name: string;

  /**
   * Module version.
   */
  readonly version?: string;

  /**
   * Module metadata.
   */
  readonly metadata?: ModuleMetadata;

  /**
   * Module options.
   */
  readonly options: ModuleOptions;

  /**
   * Lifecycle scope.
   */
  readonly scope?: LifecycleScope;
}

/**
 * Context supplied to a module during its lifecycle.
 *
 * ModuleContext is deliberately narrower than ApplicationContext.
 * It gives modules controlled access to framework capabilities.
 */
export interface ModuleContext extends ModuleContextInfo {
  /**
   * Application-level context.
   *
   * This is exposed as a typed capability rather than requiring
   * modules to import and manipulate the application directly.
   */
  readonly application: ApplicationContext;

  /**
   * Configuration manager.
   */
  readonly configuration: ConfigurationManager;

  /**
   * Logger scoped to this module.
   */
  readonly logger: Logger;

  /**
   * Gets the current configuration snapshot.
   */
  getConfiguration(): Configuration;

  /**
   * Gets a configuration value.
   */
  getConfig<T = unknown>(path: string): T | undefined;

  /**
   * Gets a required configuration value.
   */
  requireConfig<T = unknown>(path: string): T;

  /**
   * Returns another module's context.
   *
   * Access is restricted to declared module dependencies: when
   * the requested module is not declared as a dependency of the
   * current module, MissingModuleDependencyError is thrown.
   * Declared dependencies that have not been loaded yet resolve
   * to undefined.
   */
  getModuleContext(moduleId: ModuleId): ModuleContext | undefined;

  /**
   * Returns whether another module is available to this module.
   *
   * Only declared dependencies can be observed: undeclared modules
   * always report false, so a module cannot discover modules it
   * does not depend on.
   */
  hasModule(moduleId: ModuleId): boolean;
}

/**
 * Resolves the context of another module by id.
 *
 * The loader hands each module a resolver instead of its live
 * context map, so modules never hold a reference to shared
 * runtime state.
 */
export type ModuleContextResolver = (
  moduleId: ModuleId,
) => ModuleContext | undefined;

/**
 * Internal implementation of ModuleContext.
 *
 * The public ModuleContext interface is intentionally small,
 * while this implementation owns the actual state.
 */
export class DefaultModuleContext implements ModuleContext {
  public readonly id: ModuleId;

  public readonly name: string;

  public readonly version?: string;

  public readonly metadata?: ModuleMetadata;

  public readonly options: ModuleOptions;

  public readonly scope?: LifecycleScope;

  public readonly application: ApplicationContext;

  public readonly configuration: ConfigurationManager;

  public readonly logger: Logger;

  private readonly resolveModuleContext: ModuleContextResolver;

  /**
   * Ids of the modules this module declares as dependencies.
   *
   * When undefined, dependency access is not enforced (legacy
   * construction path).
   */
  private readonly declaredDependencies?: ReadonlySet<ModuleId>;

  public constructor(
    module: Module,
    dependencies: ModuleContextDependencies,
    metadata?: ModuleMetadata,
    moduleContexts:
      ReadonlyMap<ModuleId, ModuleContext> | ModuleContextResolver = new Map(),
    declaredDependencies?: readonly ModuleId[],
  ) {
    this.id = module.id;

    this.name = module.name;

    this.version = module.version;

    this.metadata = metadata;

    this.options = deepFreezeModuleOptions({
      ...(module.options ?? {}),
    });

    this.scope = module.scope;

    this.application = dependencies.application;

    this.configuration = dependencies.configuration;

    this.logger = dependencies.logger;

    this.resolveModuleContext =
      typeof moduleContexts === "function"
        ? moduleContexts
        : (moduleId: ModuleId) => moduleContexts.get(moduleId);

    this.declaredDependencies = declaredDependencies
      ? new Set(declaredDependencies)
      : undefined;
  }

  /**
   * Returns the current configuration.
   */
  public getConfiguration(): Configuration {
    return this.configuration.getConfiguration();
  }

  /**
   * Gets an optional configuration value.
   */
  public getConfig<T = unknown>(path: string): T | undefined {
    return this.configuration.get<T>(path);
  }

  /**
   * Gets a required configuration value.
   */
  public requireConfig<T = unknown>(path: string): T {
    return this.configuration.require<T>(path);
  }

  /**
   * Gets the context of another module.
   *
   * Only declared dependencies are accessible; requesting an
   * undeclared module throws MissingModuleDependencyError.
   */
  public getModuleContext(moduleId: ModuleId): ModuleContext | undefined {
    if (this.declaredDependencies && !this.declaredDependencies.has(moduleId)) {
      throw new MissingModuleDependencyError(this.id, moduleId);
    }

    return this.resolveModuleContext(moduleId);
  }

  /**
   * Checks whether a declared dependency is available.
   */
  public hasModule(moduleId: ModuleId): boolean {
    if (this.declaredDependencies && !this.declaredDependencies.has(moduleId))
      return false;

    return this.resolveModuleContext(moduleId) !== undefined;
  }
}

/**
 * Options used to create a module context.
 */
export interface CreateModuleContextOptions {
  /**
   * Module instance.
   */
  readonly module: Module;

  /**
   * Application-level dependencies.
   */
  readonly dependencies: ModuleContextDependencies;

  /**
   * Optional metadata associated with the module.
   */
  readonly metadata?: ModuleMetadata;

  /**
   * Contexts of modules that have already been resolved, either
   * as a map or as a resolver function. The loader supplies a
   * resolver so the module never receives the live context map.
   */
  readonly moduleContexts?:
    ReadonlyMap<ModuleId, ModuleContext> | ModuleContextResolver;

  /**
   * Ids of the modules the current module declares as
   * dependencies. When supplied, getModuleContext enforces
   * declared-dependency access.
   */
  readonly declaredDependencies?: readonly ModuleId[];
}

/**
 * Creates a module context.
 */
export function createModuleContext(
  options: CreateModuleContextOptions,
): ModuleContext {
  return new DefaultModuleContext(
    options.module,
    options.dependencies,
    options.metadata,
    options.moduleContexts,
    options.declaredDependencies,
  );
}

/**
 * Type guard for ModuleContext.
 */
export function isModuleContext(value: unknown): value is ModuleContext {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const context = value as Partial<ModuleContext>;

  return (
    typeof context.id === "string" &&
    typeof context.name === "string" &&
    typeof context.getConfig === "function" &&
    typeof context.requireConfig === "function"
  );
}
