import type { Container } from "../container/container.js";
import type { Configuration } from "../configuration/core/configuration.js";
import type { ModuleRegistry } from "../modules/moduleRegistry/index.js";
import type { Logger } from "../logging/core/logger.js";
import type { ContextStorage } from "../context/provider/contextStorage.storage.js";
import { getDefaultContextStorage } from "../context/provider/defaultContextStorage.storage.js";

export interface ApplicationContextOptions {
  readonly container: Container;
  readonly configuration: Configuration;
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
  private readonly configuration: Configuration;
  private readonly modules: ModuleRegistry;
  private readonly logger: Logger;
  private readonly contextStorage: ContextStorage;

  public constructor(options: ApplicationContextOptions) {
    this.container = options.container;
    this.configuration = options.configuration;
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
   */
  public getConfiguration(): Configuration {
    return this.configuration;
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
