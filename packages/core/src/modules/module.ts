import type { ApplicationContext } from "../application/applicationContext.context.js";

import type { LifecycleScope } from "../lifecycle/scope/lifecycleScope.scope.js";

import type { ModuleContext } from "./moduleContext.context.js";

/**
 * Unique identifier for a module.
 */
export type ModuleId = string;

/**
 * Configuration supplied to a module during creation.
 */
export type ModuleOptions = Readonly<Record<string, unknown>>;

/**
 * Lifecycle hooks supported by a module.
 *
 * Modules can implement only the hooks they need. These are the
 * only hook names the lifecycle engine invokes:
 *
 * initialize step → onInitialize
 * start step      → onReady
 * stop step       → onShutdown
 * destroy step    → onDestroy
 */
export interface ModuleLifecycle {
  /**
   * Called when the module is initialized.
   */
  onInitialize?(context: ModuleContext): void | Promise<void>;

  /**
   * Called after all modules have been initialized.
   *
   * This is useful when a module depends on other modules
   * being fully ready before performing startup work.
   */
  onReady?(context: ModuleContext): void | Promise<void>;

  /**
   * Called when the application begins shutting down.
   */
  onShutdown?(context: ModuleContext): void | Promise<void>;

  /**
   * Called when the module is destroyed.
   */
  onDestroy?(context: ModuleContext): void | Promise<void>;
}

/**
 * Base contract implemented by Zudojs modules.
 *
 * A module represents an independently manageable unit of
 * application functionality.
 *
 * Examples:
 *
 * AuthModule
 * UserModule
 * PaymentModule
 * OrderModule
 * NotificationModule
 *
 * The same module contract works inside a monolith,
 * modular monolith, or independent microservice.
 */
export interface Module extends ModuleLifecycle {
  /**
   * Unique module identifier.
   */
  readonly id: ModuleId;

  /**
   * Human-readable module name.
   */
  readonly name: string;

  /**
   * Optional semantic version of the module.
   */
  readonly version?: string;

  /**
   * Other modules required by this module.
   */
  readonly dependencies?: readonly ModuleId[];

  /**
   * Optional module configuration.
   */
  readonly options?: ModuleOptions;

  /**
   * Optional lifecycle scope.
   *
   * This describes how long resources owned by the module
   * should live.
   */
  readonly scope?: LifecycleScope;

  /**
   * Called when the module is attached to an application.
   *
   * Optional. Modules that need access to the application context
   * can implement this method.
   */
  attach?(application: unknown): void;
}

/**
 * Abstract base class for modules.
 *
 * Framework users can extend this instead of implementing
 * the Module interface manually.
 */
export abstract class BaseModule implements Module {
  /**
   * Unique module identifier.
   */
  public abstract readonly id: ModuleId;

  /**
   * Human-readable module name.
   */
  public abstract readonly name: string;

  /**
   * Optional semantic version.
   */
  public readonly version?: string;

  /**
   * Module dependencies.
   */
  public readonly dependencies: readonly ModuleId[];

  /**
   * Module-specific options.
   */
  public readonly options: ModuleOptions;

  /**
   * Lifecycle scope.
   */
  public readonly scope?: LifecycleScope;

  /**
   * Application context becomes available after the module
   * has been attached to an application.
   */
  protected applicationContext?: ApplicationContext;

  protected constructor(
    options: {
      readonly version?: string;
      readonly dependencies?: readonly ModuleId[];
      readonly options?: ModuleOptions;
      readonly scope?: LifecycleScope;
    } = {},
  ) {
    this.version = options.version;

    this.dependencies = [...(options.dependencies ?? [])];

    this.options = options.options ?? {};

    this.scope = options.scope;
  }

  /**
   * Called internally by the module runtime when the module
   * becomes associated with an application.
   */
  public attach(context: ApplicationContext): void {
    this.applicationContext = context;
  }

  /**
   * Returns the application context.
   *
   * Throws if the module has not yet been attached.
   */
  protected getApplicationContext(): ApplicationContext {
    if (!this.applicationContext) {
      throw new Error(
        `Module "${this.name}" has not been attached to an application.`,
      );
    }

    return this.applicationContext;
  }

  /**
   * Module initialization hook.
   */
  public async onInitialize(_context: ModuleContext): Promise<void> {
    // Optional hook.
  }

  /**
   * Module ready hook.
   */
  public async onReady(_context: ModuleContext): Promise<void> {
    // Optional hook.
  }

  /**
   * Module shutdown hook.
   */
  public async onShutdown(_context: ModuleContext): Promise<void> {
    // Optional hook.
  }

  /**
   * Module destruction hook.
   */
  public async onDestroy(_context: ModuleContext): Promise<void> {
    // Optional hook.
  }
}

/**
 * Type guard for determining whether an object is a Module.
 */
export function isModule(value: unknown): value is Module {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<Module>;

  return (
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    typeof candidate.name === "string" &&
    candidate.name.length > 0
  );
}

/**
 * Creates a lightweight module definition.
 *
 * Useful for modules that do not require a class.
 */
export function createModule(definition: Module): Module {
  return definition;
}
