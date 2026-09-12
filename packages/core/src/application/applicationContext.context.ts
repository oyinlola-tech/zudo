import type { Container } from "../container/container.js";
import type { Configuration } from "../configuration/core/configuration.js";
import type { ModuleRegistry } from "../modules/moduleRegistry/index.js";
import type { Logger } from "../logging/core/logger.js";
import type { ContextStorage } from "../context/provider/contextStorage.storage.js";
import { getDefaultContextStorage } from "../context/provider/defaultContextStorage.storage.js";

export interface ApplicationContextOptions {
  readonly container: Container;
  /**
   * The application configuration, or a function returning the
   * current one. Pass a function (for example
   * `() => manager.getConfiguration()`) so that
   * `getConfiguration()` reflects configuration reloads instead of
   * the snapshot taken when the context was created.
   */
  readonly configuration: Configuration | (() => Configuration);
  readonly modules: ModuleRegistry;
  readonly logger: Logger;
  /**
   * ContextStorage the application's runtime propagates its
   * execution context through. Defaults to
   * getDefaultContextStorage().
   */
  readonly contextStorage?: ContextStorage;
}

/**
 * Provides access to the core services and state of a Zudojs application.
 *
 * ApplicationContext belongs to a single application instance.
 * It is not responsible for creating the services it exposes.
 */
export class ApplicationContext {
  private readonly container: Container;
  private readonly configuration: () => Configuration;
  private readonly modules: ModuleRegistry;
  private readonly logger: Logger;
  private readonly contextStorage: ContextStorage;

  public constructor(options: ApplicationContextOptions) {
    this.container = options.container;
    const configuration = options.configuration;
    this.configuration =
      typeof configuration === "function"
        ? configuration
        : () => configuration;
    this.modules = options.modules;
    this.logger = options.logger;
    this.contextStorage = options.contextStorage ?? getDefaultContextStorage();
  }

  /**
   * Dependency injection container.
   */
  public getContainer(): Container {
    return this.container;
  }

  /**
   * Application configuration.
   *
   * When the context was created with a configuration accessor
   * (as `createApplication` does), this returns the configuration
   * manager's current configuration, including reloads.
   */
  public getConfiguration(): Configuration {
    return this.configuration();
  }

  /**
   * Registered application modules.
   */
  public getModules(): ModuleRegistry {
    return this.modules;
  }

  /**
   * Application logger.
   */
  public getLogger(): Logger {
    return this.logger;
  }

  /**
   * Execution context storage. Inside module hooks, container
   * factories, and lifecycle participants driven by the runtime,
   * `getContextStorage().get()` returns the runtime's execution
   * context.
   */
  public getContextStorage(): ContextStorage {
    return this.contextStorage;
  }
}
