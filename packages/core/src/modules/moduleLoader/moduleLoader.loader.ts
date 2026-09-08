import type { ApplicationContext } from "../../application/applicationContext.context.js";
import type { ConfigurationManager } from "../../configuration/configurationManager.manager.js";
import type { Logger } from "../../logging/core/logger.js";
import type { Module, ModuleId } from "../module.js";
import type { ModuleContext } from "../moduleContext.context.js";
import { createModuleContext } from "../moduleContext.context.js";
import type { ModuleDefinition } from "../moduleDefinition.definition.js";
import type { ModuleRegistry } from "../moduleRegistry/index.js";
import {
  createModuleDependencyGraph,
  resolveModuleStartupOrder,
} from "../moduleDependency/index.js";
import type {
  ModuleDependencyGraph,
  ModuleDependencyNode,
} from "../moduleDependency/moduleDependency.type.js";
import type {
  ModuleLoaderOptions,
  ModuleLoadResult,
} from "./moduleLoader.type.js";
import { ModuleLoadError } from "./moduleLoader.type.js";
import { ModuleError } from "../moduleError/moduleError.base.js";
import { MissingModuleDependencyError } from "../moduleError/moduleError.dependency.js";
import {
  InvalidModuleInstanceError,
  ModuleInstantiationError,
} from "../moduleError/moduleError.lifecycle.js";
import { ModuleNotFoundError } from "../moduleError/moduleError.registration.js";

/**
 * Default module loader.
 *
 * Reads definitions from registry, builds dependency graph,
 * validates, resolves startup order, instantiates modules.
 *
 * Dependencies are always resolved against every registered
 * definition. autoLoad filtering applies only to load roots:
 * a module registered with autoLoad disabled is still loaded
 * when another loading module requires it.
 */
export class ModuleLoader {
  private readonly application: ApplicationContext;
  private readonly configuration: ConfigurationManager;
  private readonly logger: Logger;
  private readonly registry: ModuleRegistry;
  private readonly allowExplicitLoad: boolean;
  private readonly contexts = new Map<ModuleId, ModuleContext>();
  private readonly inFlightLoads = new Map<ModuleId, Promise<Module>>();

  public constructor(registry: ModuleRegistry, options: ModuleLoaderOptions) {
    this.registry = registry;
    this.application = options.application;
    this.configuration = options.configuration;
    this.logger = options.logger;
    this.allowExplicitLoad = options.allowExplicitLoad ?? true;
  }

  /**
   * Loads every module whose definition has autoLoad enabled,
   * plus every module those modules require (regardless of the
   * required module's autoLoad setting).
   */
  public async loadAll(): Promise<ModuleLoadResult> {
    const roots = this.registry
      .getDefinitions()
      .filter((definition) => definition.autoLoad !== false)
      .map((definition) => definition.id);

    return this.loadClosure(roots, { reportSkipped: true });
  }

  /**
   * Loads a specific module and all of its required dependencies.
   *
   * Concurrent load() calls for the same module share a single
   * in-flight load.
   */
  public async load(moduleId: ModuleId): Promise<Module> {
    const registration = this.registry.require(moduleId);
    if (registration.state === "loaded" && registration.instance)
      return registration.instance;

    if (registration.definition.autoLoad === false && !this.allowExplicitLoad) {
      throw new ModuleLoadError(
        moduleId,
        new Error(
          `Module "${moduleId}" is not configured for explicit loading.`,
        ),
      );
    }

    const pending = this.inFlightLoads.get(moduleId);
    if (pending) return pending;

    const loadPromise = (async (): Promise<Module> => {
      await this.loadClosure([moduleId], { reportSkipped: false });

      const loaded = this.registry.require(moduleId);
      if (!loaded.instance)
        throw new ModuleLoadError(
          moduleId,
          new Error("Module was not instantiated."),
        );
      return loaded.instance;
    })().finally(() => {
      this.inFlightLoads.delete(moduleId);
    });

    this.inFlightLoads.set(moduleId, loadPromise);
    return loadPromise;
  }

  /**
   * Loads the dependency closure of the requested module ids.
   */
  private async loadClosure(
    requested: readonly ModuleId[],
    options: { readonly reportSkipped: boolean },
  ): Promise<ModuleLoadResult> {
    const closure = this.collectClosure(requested);

    const skipped: ModuleId[] = [];
    if (options.reportSkipped) {
      for (const definition of this.registry.getDefinitions()) {
        if (definition.autoLoad === false && !closure.has(definition.id)) {
          skipped.push(definition.id);
        }
      }
    }

    if (closure.size === 0)
      return {
        loaded: [],
        alreadyLoaded: [],
        skipped: Object.freeze([...skipped]),
        order: [],
      };

    const graph = this.createGraph([...closure.values()]);
    const order = resolveModuleStartupOrder(graph);
    const loaded: Module[] = [];
    const alreadyLoaded: Module[] = [];

    for (const moduleId of order) {
      const registration = this.registry.get(moduleId);
      if (!registration)
        throw new ModuleLoadError(
          moduleId,
          new Error(
            `Module "${moduleId}" disappeared from the registry during loading.`,
          ),
        );
      if (registration.state === "loaded" && registration.instance) {
        alreadyLoaded.push(registration.instance);
        continue;
      }

      const instance = await this.instantiate(registration.definition);
      loaded.push(instance);
    }

    return {
      loaded: Object.freeze([...loaded]),
      alreadyLoaded: Object.freeze([...alreadyLoaded]),
      skipped: Object.freeze([...skipped]),
      order: Object.freeze([...order]),
    };
  }

  /**
   * Collects the dependency closure of the requested modules
   * across every registered definition.
   *
   * Optional dependencies join the closure only when they are
   * registered; missing required dependencies are reported with
   * the module that needs them.
   */
  private collectClosure(
    requested: readonly ModuleId[],
  ): Map<ModuleId, ModuleDefinition> {
    const collected = new Map<ModuleId, ModuleDefinition>();
    const queue: ModuleId[] = [...requested];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (collected.has(currentId)) continue;

      const registration = this.registry.require(currentId);
      collected.set(currentId, registration.definition);

      for (const dependency of this.registry.getDependencies(currentId)) {
        if (!this.registry.has(dependency.id)) {
          if (dependency.optional) continue;
          throw new MissingModuleDependencyError(currentId, dependency.id);
        }
        queue.push(dependency.id);
      }
    }

    return collected;
  }

  private createGraph(
    definitions: readonly ModuleDefinition[],
  ): ModuleDependencyGraph {
    const nodes: ModuleDependencyNode[] = definitions.map((d) => ({
      id: d.id,
      dependencies: this.registry.getDependencies(d.id),
      version: d.version,
    }));
    return createModuleDependencyGraph(nodes);
  }

  private async instantiate(definition: ModuleDefinition): Promise<Module> {
    const moduleId = definition.id;
    this.registry.setState(moduleId, "loading");

    try {
      const module = await definition.factory(definition.options);
      if (!module || typeof module !== "object")
        throw new InvalidModuleInstanceError(
          moduleId,
          `Module factory for "${moduleId}" did not return a valid module.`,
        );
      if (module.id !== moduleId)
        throw new InvalidModuleInstanceError(
          moduleId,
          `Module factory returned module "${module.id}" but expected "${moduleId}".`,
        );

      if (typeof module.attach === "function") module.attach(this.application);

      const moduleLogger = this.createModuleLogger(module);
      const context = createModuleContext({
        module,
        dependencies: {
          application: this.application,
          configuration: this.configuration,
          logger: moduleLogger,
        },
        metadata: definition.metadata,
        /*
         * Modules get a resolver, never the shared context map, so
         * they cannot enumerate or reach undeclared modules.
         */
        moduleContexts: (dependencyId: ModuleId) =>
          this.contexts.get(dependencyId),
        declaredDependencies: this.registry
          .getDependencies(moduleId)
          .map((dependency) => dependency.id),
      });

      this.contexts.set(moduleId, context);
      this.registry.setState(moduleId, "loaded", { instance: module });
      return module;
    } catch (error) {
      this.registry.setState(moduleId, "failed", { error });
      if (error instanceof ModuleError) throw error;
      throw new ModuleInstantiationError(moduleId, error);
    }
  }

  private createModuleLogger(module: Module): Logger {
    const logger = this.logger as Logger & {
      child?: (context: Record<string, unknown>) => Logger;
    };
    if (typeof logger.child === "function")
      return logger.child({ moduleId: module.id, module: module.name });
    return this.logger;
  }

  public getContext(moduleId: ModuleId): ModuleContext | undefined {
    return this.contexts.get(moduleId);
  }

  public requireContext(moduleId: ModuleId): ModuleContext {
    const context = this.getContext(moduleId);
    if (!context) throw new ModuleNotFoundError(moduleId);
    return context;
  }

  public getContexts(): ReadonlyMap<ModuleId, ModuleContext> {
    return new Map(this.contexts);
  }
  public isLoaded(moduleId: ModuleId): boolean {
    return this.registry.get(moduleId)?.state === "loaded";
  }

  /**
   * Forgets a module's runtime instance and context.
   *
   * The loader does not run lifecycle hooks; callers that need
   * the instance shut down first should use
   * ModuleLifecycleManager.unloadModule(). Returns false when the
   * module is not registered or holds no instance.
   */
  public unload(moduleId: ModuleId): boolean {
    const registration = this.registry.get(moduleId);
    if (!registration) return false;

    const hadInstance = this.contexts.delete(moduleId);
    if (
      registration.state === "registered" ||
      registration.state === "unloaded"
    )
      return hadInstance;

    this.registry.setState(moduleId, "unloaded");
    return true;
  }
}

/** Creates a module loader. */
export function createModuleLoader(
  registry: ModuleRegistry,
  options: ModuleLoaderOptions,
): ModuleLoader {
  return new ModuleLoader(registry, options);
}
