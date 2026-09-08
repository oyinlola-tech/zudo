import type { Module, ModuleId } from "../module.js";
import type { ModuleDefinition } from "../moduleDefinition.definition.js";
import { isModuleDefinition } from "../moduleDefinition.definition.js";
import type { ModuleMetadata } from "../moduleMetadata.metadata.js";
import type { ModuleDependency } from "../moduleDependency/moduleDependency.type.js";
import type {
  ModuleRegistrationState,
  ModuleRegistration,
  ModuleRegistryOptions,
  ModuleRegistryEvent,
  ModuleRegistryListener,
  ModuleRegistry,
  ModuleRegisterOptions,
} from "./moduleRegistry.type.js";
import {
  DuplicateModuleError,
  InvalidModuleDefinitionError,
  ModuleNotFoundError,
} from "../moduleError/moduleError.registration.js";
import { InvalidModuleStateError } from "../moduleError/moduleError.lifecycle.js";

/** Default in-memory module registry. */
export class DefaultModuleRegistry implements ModuleRegistry {
  private readonly registrations = new Map<ModuleId, ModuleRegistration>();
  private readonly listeners = new Set<ModuleRegistryListener>();
  private readonly allowReplacement: boolean;

  public constructor(options: ModuleRegistryOptions = {}) {
    this.allowReplacement = options.allowReplacement ?? false;
  }

  public register<TModule extends Module>(
    definition: ModuleDefinition<TModule>,
    options: ModuleRegisterOptions = {},
  ): ModuleRegistration<TModule> {
    if (!isModuleDefinition(definition))
      throw new InvalidModuleDefinitionError("Invalid module definition.");

    /*
     * Ids are canonicalized when the definition is created
     * (defineModule rejects untrimmed ids), so the registry can
     * use definition.id directly.
     */
    const moduleId = definition.id;
    if (moduleId !== moduleId.trim())
      throw new InvalidModuleDefinitionError(
        `Module id "${moduleId}" must not contain leading or trailing whitespace.`,
        moduleId,
      );

    const existing = this.registrations.get(moduleId);
    if (existing && !this.allowReplacement)
      throw new DuplicateModuleError(moduleId);

    /*
     * Replacing a definition whose module instance is already
     * loaded (or currently loading) would strand the live
     * instance: the lifecycle system would keep managing an
     * object whose definition no longer exists. Callers must opt
     * in explicitly with { replaceLoaded: true }.
     */
    if (
      existing &&
      (existing.state === "loaded" || existing.state === "loading") &&
      options.replaceLoaded !== true
    ) {
      throw new InvalidModuleStateError(moduleId, existing.state, [
        "registered",
        "failed",
        "unloaded",
      ]);
    }

    const now = new Date();
    const registration: ModuleRegistration<TModule> = Object.freeze({
      definition,
      state: "registered",
      registeredAt: existing?.registeredAt ?? now,
    });
    this.registrations.set(moduleId, registration);
    this.emit({
      type: existing ? "replaced" : "registered",
      moduleId,
      previous: existing,
      current: registration,
      timestamp: now,
    });
    return registration;
  }

  public registerMany(
    definitions: readonly ModuleDefinition[],
  ): readonly ModuleRegistration[] {
    const registrations: ModuleRegistration[] = [];
    for (const definition of definitions)
      registrations.push(this.register(definition));
    return Object.freeze(registrations);
  }

  public get(moduleId: ModuleId): ModuleRegistration | undefined {
    return this.registrations.get(moduleId);
  }

  public require(moduleId: ModuleId): ModuleRegistration {
    const registration = this.get(moduleId);
    if (!registration) throw new ModuleNotFoundError(moduleId);
    return registration;
  }

  public has(moduleId: ModuleId): boolean {
    return this.registrations.has(moduleId);
  }

  public unregister(moduleId: ModuleId): boolean {
    const existing = this.registrations.get(moduleId);
    if (!existing) return false;
    this.registrations.delete(moduleId);
    this.emit({
      type: "unregistered",
      moduleId,
      previous: existing,
      timestamp: new Date(),
    });
    return true;
  }

  public getAll(): readonly ModuleRegistration[] {
    return Object.freeze([...this.registrations.values()]);
  }
  public getDefinitions(): readonly ModuleDefinition[] {
    return Object.freeze(
      [...this.registrations.values()].map((r) => r.definition),
    );
  }

  public getLoadedModules(): readonly Module[] {
    const modules: Module[] = [];
    for (const registration of this.registrations.values()) {
      if (registration.state === "loaded" && registration.instance)
        modules.push(registration.instance);
    }
    return Object.freeze(modules);
  }

  public setState(
    moduleId: ModuleId,
    state: ModuleRegistrationState,
    details: { readonly instance?: Module; readonly error?: unknown } = {},
  ): ModuleRegistration {
    const existing = this.require(moduleId);
    const now = new Date();
    /*
     * Leaving a state that carries a live instance drops the
     * instance reference; the registry never keeps a stale module
     * object around once it has been unloaded.
     */
    const registration: ModuleRegistration = Object.freeze({
      definition: existing.definition,
      instance:
        state === "unloaded"
          ? undefined
          : (details.instance ?? existing.instance),
      state,
      error: details.error,
      registeredAt: existing.registeredAt,
      loadedAt: state === "loaded" ? now : existing.loadedAt,
    });
    this.registrations.set(moduleId, registration);
    this.emit({
      type: "state-changed",
      moduleId,
      previous: existing,
      current: registration,
      timestamp: now,
    });
    return registration;
  }

  public getDependencies(moduleId: ModuleId): readonly ModuleDependency[] {
    const registration = this.require(moduleId);
    const dependencies = registration.definition.dependencies ?? [];
    return Object.freeze(
      dependencies.map((dep) => {
        if (typeof dep === "string")
          return Object.freeze({ id: dep, optional: false });
        return Object.freeze({
          id: dep.id,
          optional: dep.optional ?? false,
          version: dep.version,
        });
      }),
    );
  }

  public getMetadata(moduleId: ModuleId): ModuleMetadata | undefined {
    return this.require(moduleId).definition.metadata;
  }

  public subscribe(listener: ModuleRegistryListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public clear(): void {
    const modules = [...this.registrations.keys()];
    for (const moduleId of modules) this.unregister(moduleId);
  }

  private emit(event: ModuleRegistryEvent): void {
    for (const listener of this.listeners) {
      try {
        const result = listener(event);
        if (result instanceof Promise)
          void result.catch(() => {
            /* Listener failures must not corrupt registry state. */
          });
      } catch {
        /* Registry listeners are observers. Their failures must not interrupt registry operations. */
      }
    }
  }
}

/** Creates a default module registry. */
export function createModuleRegistry(
  options: ModuleRegistryOptions = {},
): ModuleRegistry {
  return new DefaultModuleRegistry(options);
}

/** Type guard for module registrations. */
export function isModuleRegistration(
  value: unknown,
): value is ModuleRegistration {
  if (value === null || typeof value !== "object") return false;
  const registration = value as Partial<ModuleRegistration>;
  return (
    typeof registration.definition === "object" &&
    registration.definition !== null &&
    typeof registration.state === "string" &&
    registration.registeredAt instanceof Date
  );
}
