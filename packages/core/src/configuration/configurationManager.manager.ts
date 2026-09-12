import { Configuration } from "./core/configuration.js";
import { ConfigurationLoader } from "./loader/configurationLoader.loader.js";
import type {
  ConfigurationLoaderOptions,
  ConfigurationLoadResult,
} from "./loader/configurationLoader.loader.js";
import type { ConfigurationProvider } from "./registry/configurationProvider.provider.js";
import { DefaultConfigurationProvider } from "./registry/configurationProvider.provider.js";
import { ConfigurationRegistry } from "./registry/configurationRegistry.registry.js";
import { InvalidStateError } from "../errors/exceptions.js";
import { ConfigurationSchemaRegistry } from "./schema/configurationSchema.schema.js";
import {
  applyConfigurationSchemaDefaults,
  validateConfiguration,
} from "./schema/configurationValidation.validator.js";
import type {
  ConfigurationValidationOptions,
  ConfigurationValidationReport,
} from "./schema/configurationValidation.validator.js";
import { ConfigurationValidationError } from "./schema/configurationValidation.validator.js";
import { ConfigurationRedactor } from "./error/configurationRedactor.redactor.js";
import type {
  ConfigurationRedactorOptions,
  RedactedConfiguration,
} from "./error/configurationRedactor.redactor.js";
import type {
  ConfigurationEventListener,
  ConfigurationEventTypeValue,
  ConfigurationLifecycleEvent,
} from "./events/configurationEvents.events.js";
import {
  createConfigurationFailedEvent,
  createConfigurationInitializingEvent,
  createConfigurationLoadedEvent,
  createConfigurationReadyEvent,
  createConfigurationReloadedEvent,
  createConfigurationReloadingEvent,
  createConfigurationValidatedEvent,
} from "./events/configurationEvents.events.js";

/** Lifecycle state of the configuration manager. */
export enum ConfigurationManagerState {
  CREATED = "created",
  LOADING = "loading",
  LOADED = "loaded",
  READY = "ready",
  FAILED = "failed",
}

/** Options used to create a ConfigurationManager. */
export interface ConfigurationManagerOptions {
  readonly loader?: ConfigurationLoader;
  readonly provider?: ConfigurationProvider;
  readonly registry?: ConfigurationRegistry;
  readonly schemas?: ConfigurationSchemaRegistry;
  readonly redactor?: ConfigurationRedactor;
  readonly loaderOptions?: ConfigurationLoaderOptions;
  readonly validationOptions?: ConfigurationValidationOptions;
  readonly redactorOptions?: ConfigurationRedactorOptions;
}

/** Complete configuration initialization result. */
export interface ConfigurationManagerResult {
  readonly configuration: Configuration;
  readonly load: ConfigurationLoadResult;
  readonly validation: ConfigurationValidationReport;
}

/**
 * Event type accepted when subscribing to the manager.
 *
 * "*" subscribes to every configuration lifecycle event.
 */
export type ConfigurationEventSubscription = ConfigurationEventTypeValue | "*";

/** Coordinates the complete configuration lifecycle. */
export class ConfigurationManager {
  private readonly loader: ConfigurationLoader;
  private readonly provider: ConfigurationProvider;
  private readonly registry: ConfigurationRegistry;
  private readonly schemas: ConfigurationSchemaRegistry;
  private readonly redactor: ConfigurationRedactor;
  private readonly validationOptions: ConfigurationValidationOptions;
  private readonly listeners = new Map<
    ConfigurationEventSubscription,
    Set<ConfigurationEventListener>
  >();
  private readonly listenerErrors: unknown[] = [];
  private configuration: Configuration | undefined;
  private loadResult: ConfigurationLoadResult | undefined;
  private validationReport: ConfigurationValidationReport | undefined;
  private missingSetConfigurationWarned = false;
  private inFlightReload: Promise<ConfigurationManagerResult> | undefined;
  private stateValue: ConfigurationManagerState =
    ConfigurationManagerState.CREATED;

  public constructor(options: ConfigurationManagerOptions = {}) {
    this.loader =
      options.loader ?? new ConfigurationLoader(options.loaderOptions);
    this.provider = options.provider ?? new DefaultConfigurationProvider();
    this.registry = options.registry ?? new ConfigurationRegistry();
    this.schemas = options.schemas ?? new ConfigurationSchemaRegistry();
    this.redactor =
      options.redactor ?? new ConfigurationRedactor(options.redactorOptions);
    this.validationOptions = options.validationOptions ?? {};
  }

  /**
   * Subscribes to configuration lifecycle events.
   *
   * Pass "*" to receive every event. Returns an unsubscribe
   * function.
   */
  public on(
    type: ConfigurationEventSubscription,
    listener: ConfigurationEventListener,
  ): () => void {
    let listeners = this.listeners.get(type);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(type, listeners);
    }
    listeners.add(listener);
    return () => this.off(type, listener);
  }

  /** Removes a previously registered event listener. */
  public off(
    type: ConfigurationEventSubscription,
    listener: ConfigurationEventListener,
  ): boolean {
    return this.listeners.get(type)?.delete(listener) ?? false;
  }

  /**
   * Returns errors thrown by event listeners.
   *
   * Listener failures never interrupt configuration loading;
   * they are collected here for diagnostics.
   */
  public getListenerErrors(): readonly unknown[] {
    return [...this.listenerErrors];
  }

  public async initialize(): Promise<ConfigurationManagerResult> {
    if (this.stateValue === ConfigurationManagerState.LOADING)
      throw new InvalidStateError(
        "Configuration initialization is already in progress.",
        { state: this.stateValue },
      );
    this.stateValue = ConfigurationManagerState.LOADING;
    this.emit(createConfigurationInitializingEvent(this.stateValue));

    try {
      const loadResult = await this.loader.load(this.registry.getSources());
      this.loadResult = loadResult;
      this.configuration = loadResult.configuration;
      this.stateValue = ConfigurationManagerState.LOADED;
      this.emit(createConfigurationLoadedEvent(this.stateValue, loadResult));

      const validation = await validateConfiguration(
        this.configuration,
        this.schemas,
        this.validationOptions,
      );
      this.validationReport = validation;

      if (!validation.valid) {
        this.stateValue = ConfigurationManagerState.FAILED;
        throw new ConfigurationValidationError(
          validation.issues,
          validation.schemaCount,
          validation.invalidSchemaCount,
        );
      }

      this.configuration = applyConfigurationSchemaDefaults(
        this.configuration,
        this.schemas,
      );

      this.emit(
        createConfigurationValidatedEvent(
          this.stateValue,
          this.configuration,
          validation,
        ),
      );

      this.providerConfiguration(this.configuration);
      this.stateValue = ConfigurationManagerState.READY;
      this.emit(
        createConfigurationReadyEvent(
          this.stateValue,
          this.configuration,
          validation,
        ),
      );
      return {
        configuration: this.configuration,
        load: loadResult,
        validation,
      };
    } catch (error) {
      this.stateValue = ConfigurationManagerState.FAILED;
      this.emit(createConfigurationFailedEvent(this.stateValue, error));
      throw error;
    }
  }

  /**
   * Reloads configuration from the registered sources.
   *
   * Overlapping calls are serialised: a reload requested while one
   * is already in progress shares that in-flight reload instead of
   * failing with InvalidStateError. A manager that is not ready yet
   * is initialized instead.
   */
  public async reload(): Promise<ConfigurationManagerResult> {
    if (this.inFlightReload) return this.inFlightReload;

    if (this.stateValue !== ConfigurationManagerState.READY)
      return this.initialize();

    const reload = this.performReload().finally(() => {
      this.inFlightReload = undefined;
    });
    this.inFlightReload = reload;
    return reload;
  }

  private async performReload(): Promise<ConfigurationManagerResult> {
    const previousConfiguration = this.configuration as Configuration;
    const previousLoadResult = this.loadResult;
    const previousValidation = this.validationReport;
    this.stateValue = ConfigurationManagerState.LOADING;
    this.emit(
      createConfigurationReloadingEvent(this.stateValue, previousConfiguration),
    );

    try {
      const loadResult = await this.loader.load(this.registry.getSources());
      let configuration = loadResult.configuration;
      const validation = await validateConfiguration(
        configuration,
        this.schemas,
        this.validationOptions,
      );

      if (!validation.valid) {
        this.configuration = previousConfiguration;
        this.loadResult = previousLoadResult;
        this.validationReport = previousValidation;
        this.stateValue = ConfigurationManagerState.READY;
        throw new ConfigurationValidationError(
          validation.issues,
          validation.schemaCount,
          validation.invalidSchemaCount,
        );
      }

      configuration = applyConfigurationSchemaDefaults(
        configuration,
        this.schemas,
      );

      this.configuration = configuration;
      this.loadResult = loadResult;
      this.validationReport = validation;
      this.providerConfiguration(configuration);
      this.stateValue = ConfigurationManagerState.READY;
      this.emit(
        createConfigurationReloadedEvent(
          this.stateValue,
          previousConfiguration,
          configuration,
          loadResult,
          validation,
        ),
      );
      return { configuration, load: loadResult, validation };
    } catch (error) {
      if (this.configuration !== previousConfiguration)
        this.configuration = previousConfiguration;
      this.stateValue = previousConfiguration
        ? ConfigurationManagerState.READY
        : ConfigurationManagerState.FAILED;
      this.emit(
        createConfigurationFailedEvent(
          this.stateValue,
          error,
          previousConfiguration,
        ),
      );
      throw error;
    }
  }

  public getConfiguration(): Configuration {
    this.ensureReady();
    return this.configuration as Configuration;
  }
  public getProvider(): ConfigurationProvider {
    return this.provider;
  }
  public getRegistry(): ConfigurationRegistry {
    return this.registry;
  }
  public getSchemaRegistry(): ConfigurationSchemaRegistry {
    return this.schemas;
  }
  /**
   * Returns the active configuration scoped to a section
   * registered with the manager's registry.
   */
  public getSection(name: string): Configuration {
    this.ensureReady();
    return this.registry.getConfigurationSection(
      this.configuration as Configuration,
      name,
    );
  }
  public getLoader(): ConfigurationLoader {
    return this.loader;
  }
  public getRedactor(): ConfigurationRedactor {
    return this.redactor;
  }
  public getState(): ConfigurationManagerState {
    return this.stateValue;
  }
  public isReady(): boolean {
    return this.stateValue === ConfigurationManagerState.READY;
  }
  public getValidationReport(): ConfigurationValidationReport | undefined {
    return this.validationReport;
  }
  public getLoadResult(): ConfigurationLoadResult | undefined {
    return this.loadResult;
  }
  public getRedactedConfiguration(): RedactedConfiguration | undefined {
    return this.configuration
      ? this.redactor.redact(this.configuration)
      : undefined;
  }
  public get<T = unknown>(path: string): T | undefined {
    this.ensureReady();
    return this.getProvider().get<T>(path);
  }
  public require<T = unknown>(path: string): T {
    this.ensureReady();
    return this.getProvider().require<T>(path);
  }

  private providerConfiguration(configuration: Configuration): void {
    if (typeof this.provider.setConfiguration === "function") {
      this.provider.setConfiguration(configuration);
      return;
    }

    if (!this.missingSetConfigurationWarned) {
      this.missingSetConfigurationWarned = true;
      console.warn(
        "ConfigurationManager: the configured ConfigurationProvider does not implement setConfiguration(); loaded configuration will not be pushed into the provider.",
      );
    }
  }

  private emit(event: ConfigurationLifecycleEvent): void {
    const listeners = [
      ...(this.listeners.get(event.type as ConfigurationEventTypeValue) ?? []),
      ...(this.listeners.get("*") ?? []),
    ];

    for (const listener of listeners) {
      try {
        const result = listener(event);
        if (result instanceof Promise) {
          void result.catch((error) => {
            this.listenerErrors.push(error);
          });
        }
      } catch (error) {
        /* Listener failures must never break configuration loading. */
        this.listenerErrors.push(error);
      }
    }
  }

  private ensureReady(): void {
    if (this.stateValue !== ConfigurationManagerState.READY)
      throw new InvalidStateError(
        `Configuration is not ready. Current state: ${this.stateValue}.`,
        { state: this.stateValue },
      );
  }
}

/** Creates a ConfigurationManager. */
export function createConfigurationManager(
  options: ConfigurationManagerOptions = {},
): ConfigurationManager {
  return new ConfigurationManager(options);
}
