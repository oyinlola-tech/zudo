import type { Module, ModuleId, ModuleOptions } from "./module.js";

import type { ModuleMetadata } from "./moduleMetadata.metadata.js";

import { InvalidModuleDefinitionError } from "./moduleError/moduleError.registration.js";

/**
 * Recursively freezes a module options tree.
 *
 * Already frozen nodes are skipped. Only plain objects and
 * arrays are traversed; class instances are frozen shallowly.
 */
export function deepFreezeModuleOptions<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Object.isFrozen(value)) return value;

  if (Array.isArray(value)) {
    for (const item of value) deepFreezeModuleOptions(item);
    return Object.freeze(value) as T;
  }

  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype === Object.prototype || prototype === null) {
    for (const child of Object.values(value)) deepFreezeModuleOptions(child);
  }
  return Object.freeze(value) as T;
}

/**
 * Factory used to create a module instance.
 *
 * The factory receives the module's resolved options.
 */
export type ModuleFactory<TModule extends Module = Module> = (
  options?: ModuleOptions,
) => TModule;

/**
 * Defines a module dependency.
 *
 * This is intentionally more expressive than simply using
 * a ModuleId because future versions of the framework may
 * need optional or versioned dependencies.
 */
export interface ModuleDependencyDefinition {
  /**
   * Identifier of the required module.
   */
  readonly id: ModuleId;

  /**
   * Whether the dependency is optional.
   *
   * Defaults to false.
   */
  readonly optional?: boolean;

  /**
   * Optional version constraint.
   */
  readonly version?: string;
}

/**
 * Complete static definition of a Zudojs module.
 */
export interface ModuleDefinition<TModule extends Module = Module> {
  /**
   * Unique module identifier.
   */
  readonly id: ModuleId;

  /**
   * Human-readable module name.
   */
  readonly name: string;

  /**
   * Optional semantic version.
   */
  readonly version?: string;

  /**
   * Factory used to create the module instance.
   */
  readonly factory: ModuleFactory<TModule>;

  /**
   * Dependencies required by the module.
   */
  readonly dependencies?: readonly (ModuleId | ModuleDependencyDefinition)[];

  /**
   * Static module metadata.
   */
  readonly metadata?: ModuleMetadata;

  /**
   * Default module options.
   */
  readonly options?: ModuleOptions;

  /**
   * Whether the module should be automatically loaded.
   *
   * Defaults to true.
   *
   * A module with autoLoad disabled is still loaded when it is
   * requested explicitly or when another loading module requires
   * it as a dependency.
   */
  readonly autoLoad?: boolean;
}

/**
 * Options used when creating a module definition.
 */
export interface DefineModuleOptions<TModule extends Module = Module> {
  readonly id: ModuleId;

  readonly name: string;

  readonly version?: string;

  readonly factory: ModuleFactory<TModule>;

  readonly dependencies?: readonly (ModuleId | ModuleDependencyDefinition)[];

  readonly metadata?: ModuleMetadata;

  readonly options?: ModuleOptions;

  readonly autoLoad?: boolean;
}

/**
 * Creates an immutable module definition.
 *
 * A definition describes a module but does not instantiate it.
 */
export function defineModule<TModule extends Module = Module>(
  options: DefineModuleOptions<TModule>,
): ModuleDefinition<TModule> {
  validateModuleDefinition(options);

  return Object.freeze({
    id: options.id,
    name: options.name,
    version: options.version,
    factory: options.factory,
    dependencies: normalizeDependencies(options.dependencies),
    metadata: options.metadata,
    options: options.options
      ? deepFreezeModuleOptions({ ...options.options })
      : undefined,
    autoLoad: options.autoLoad ?? true,
  });
}

/**
 * Converts a Module instance into a module definition.
 *
 * Useful when a module has already been implemented as a class.
 */
export function moduleToDefinition<TModule extends Module>(
  module: TModule,
  factory?: ModuleFactory<TModule>,
): ModuleDefinition<TModule> {
  return defineModule({
    id: module.id,
    name: module.name,
    version: module.version,
    dependencies: module.dependencies,
    options: module.options,
    factory: factory ?? (() => module),
  });
}

/**
 * Normalizes dependency declarations into a consistent
 * representation.
 */
export function normalizeDependencies(
  dependencies?: readonly (ModuleId | ModuleDependencyDefinition)[],
): readonly ModuleDependencyDefinition[] {
  if (!dependencies) {
    return [];
  }

  return Object.freeze(
    dependencies.map((dependency) => {
      if (typeof dependency === "string") {
        return Object.freeze({
          id: dependency,
          optional: false,
        });
      }

      return Object.freeze({
        id: dependency.id,
        optional: dependency.optional ?? false,
        version: dependency.version,
      });
    }),
  );
}

/**
 * Checks whether a value is a valid module definition.
 */
export function isModuleDefinition(value: unknown): value is ModuleDefinition {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const definition = value as Partial<ModuleDefinition>;

  return (
    typeof definition.id === "string" &&
    definition.id.length > 0 &&
    typeof definition.name === "string" &&
    definition.name.length > 0 &&
    typeof definition.factory === "function"
  );
}

/**
 * Validates a module definition before it enters
 * the module registry.
 */
function validateModuleDefinition<TModule extends Module>(
  definition: DefineModuleOptions<TModule>,
): void {
  if (!definition.id || definition.id.trim().length === 0) {
    throw new InvalidModuleDefinitionError(
      "Module definition requires a non-empty id.",
    );
  }

  /*
   * Ids are canonicalized once here: a definition whose id would
   * change under trim() is rejected so the registry, loader, and
   * lifecycle can use definition.id directly everywhere.
   */
  if (definition.id !== definition.id.trim()) {
    throw new InvalidModuleDefinitionError(
      `Module id "${definition.id}" must not contain leading or trailing whitespace.`,
      definition.id,
    );
  }

  if (!definition.name || definition.name.trim().length === 0) {
    throw new InvalidModuleDefinitionError(
      `Module "${definition.id}" requires a non-empty name.`,
      definition.id,
    );
  }

  if (typeof definition.factory !== "function") {
    throw new InvalidModuleDefinitionError(
      `Module "${definition.id}" requires a factory function.`,
      definition.id,
    );
  }

  const dependencies = definition.dependencies ?? [];

  const dependencyIds = new Set<string>();

  for (const dependency of dependencies) {
    const id = typeof dependency === "string" ? dependency : dependency.id;

    if (!id || id.trim().length === 0) {
      throw new InvalidModuleDefinitionError(
        `Module "${definition.id}" contains an invalid dependency.`,
        definition.id,
      );
    }

    if (id === definition.id) {
      throw new InvalidModuleDefinitionError(
        `Module "${definition.id}" cannot depend on itself.`,
        definition.id,
      );
    }

    if (dependencyIds.has(id)) {
      throw new InvalidModuleDefinitionError(
        `Module "${definition.id}" declares dependency "${id}" more than once.`,
        definition.id,
      );
    }

    dependencyIds.add(id);
  }
}
