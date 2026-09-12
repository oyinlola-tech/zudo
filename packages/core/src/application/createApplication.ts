import { Application } from "./application.js";
import { ApplicationContext } from "./applicationContext.context.js";
import { Container } from "../container/container.js";
import {
  ConfigurationManager,
  ConfigurationManagerState,
  createConfigurationManager,
} from "../configuration/configurationManager.manager.js";
import type { Logger } from "../logging/core/logger.js";
import { ConsoleLogger } from "../logging/console/consoleLogger.logger.js";
import type { LoggerOptions } from "../logging/core/loggerOptions.options.js";
import { Lifecycle } from "../lifecycle/core/lifecycle.js";
import type { LifecycleParticipant } from "../lifecycle/core/lifecycle.js";
import type { ModuleDefinition } from "../modules/moduleDefinition.definition.js";
import { createModuleRegistry } from "../modules/moduleRegistry/moduleRegistry.registry.js";
import type { ModuleRegistry } from "../modules/moduleRegistry/index.js";
import { createModuleLoader } from "../modules/moduleLoader/moduleLoader.loader.js";
import type { ModuleLoader } from "../modules/moduleLoader/moduleLoader.loader.js";
import { createModuleLifecycleManager } from "../modules/moduleLifecycle/moduleLifecycle.lifecycle.js";
import { createRuntime } from "../runtime/runtime.js";
import type { Runtime } from "../runtime/runtime.js";
import { resolveRuntimeOptions } from "../runtime/runtimeOptions/runtimeOptions.resolver.js";
import type { RuntimeOptions } from "../runtime/runtimeOptions/runtimeOptions.type.js";
import type { RuntimeSignalTarget } from "../runtime/runtimeSignals/runtimeSignals.js";
import type { ContextStorage } from "../context/provider/contextStorage.storage.js";
import { getDefaultContextStorage } from "../context/provider/defaultContextStorage.storage.js";

/**
 * Options for {@link createApplication}.
 */
export interface CreateApplicationOptions {
  /**
   * Module definitions to register before the runtime starts.
   */
  readonly modules?: readonly ModuleDefinition[];

  /**
   * Application-level lifecycle participants (registered on the
   * application Lifecycle in order).
   */
  readonly participants?: readonly LifecycleParticipant[];

  /**
   * Runtime options (name, mode, role, startup/shutdown/signal
   * behaviour). The startup/shutdown continueOn*Error flags are also
   * applied to the module lifecycle manager so both layers agree.
   */
  readonly runtime?: RuntimeOptions;

  /**
   * Pre-built configuration manager. Initialized here if it has not
   * been initialized yet.
   */
  readonly configuration?: ConfigurationManager;

  /**
   * Logger, or options for the default ConsoleLogger.
   */
  readonly logger?: Logger | LoggerOptions;

  /**
   * Dependency container for the application context. When omitted a
   * Container whose `currentScope` is the current execution context
   * (from `contextStorage`) is created, so "scoped" providers resolve
   * to one instance per execution context.
   */
  readonly container?: Container;

  /**
   * ContextStorage shared by the application context, container
   * scoping, module lifecycle, runtime, and (when the logger is
   * created here) the logger. Defaults to getDefaultContextStorage().
   */
  readonly contextStorage?: ContextStorage;

  /**
   * Module registry; created when omitted.
   */
  readonly moduleRegistry?: ModuleRegistry;

  /**
   * Process-like target for signal handling (tests inject an emitter).
   */
  readonly signalTarget?: RuntimeSignalTarget;

  /**
   * Start the application before returning. Defaults to false.
   */
  readonly autoStart?: boolean;
}

function isLogger(value: Logger | LoggerOptions | undefined): value is Logger {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Logger).info === "function" &&
    typeof (value as Logger).error === "function"
  );
}

/**
 * Wires the standard application graph — container, configuration,
 * logger, module registry/loader/lifecycle, runtime, and application
 * lifecycle — and returns an initialized Application. One
 * ContextStorage is threaded through every piece, so the runtime's
 * execution context is visible from module hooks, container
 * factories, lifecycle participants, and log entries.
 *
 * The runtime is created through a factory, so the application can be
 * restarted (stop() then start()) with a fresh runtime each time.
 */
export async function createApplication(
  options: CreateApplicationOptions = {},
): Promise<Application> {
  const contextStorage = options.contextStorage ?? getDefaultContextStorage();

  const logger = isLogger(options.logger)
    ? options.logger
    : new ConsoleLogger({ contextStorage, ...options.logger });

  const configuration = options.configuration ?? createConfigurationManager();

  if (configuration.getState() === ConfigurationManagerState.CREATED) {
    await configuration.initialize();
  }

  const container =
    options.container ??
    new Container({ currentScope: () => contextStorage.get() });
  const moduleRegistry = options.moduleRegistry ?? createModuleRegistry();

  if (options.modules && options.modules.length > 0) {
    moduleRegistry.registerMany(options.modules);
  }

  const context = new ApplicationContext({
    container,
    /*
     * An accessor rather than a snapshot: after
     * `configuration.reload()` the application context must hand
     * out the reloaded configuration, not the one captured here.
     */
    configuration: () => configuration.getConfiguration(),
    modules: moduleRegistry,
    logger,
    contextStorage,
  });

  const runtimeOptions = options.runtime ?? {};
  const resolved = resolveRuntimeOptions(runtimeOptions);

  let previousLoader: ModuleLoader | undefined;

  const createApplicationRuntime = (): Runtime => {
    /*
     * A restart gets fresh module instances: the previous runtime has
     * already stopped and destroyed them, so forget the instances and
     * contexts before the new loader re-creates them.
     */
    if (previousLoader) {
      for (const registration of moduleRegistry.getAll()) {
        previousLoader.unload(registration.definition.id);
      }
    }

    const moduleLoader = createModuleLoader(moduleRegistry, {
      application: context,
      configuration,
      logger,
    });
    previousLoader = moduleLoader;

    const moduleLifecycle = createModuleLifecycleManager(
      moduleRegistry,
      moduleLoader,
      {
        continueOnInitializeError: resolved.startup.continueOnInitializeError,
        continueOnStartError: resolved.startup.continueOnStartError,
        continueOnStopError: resolved.shutdown.continueOnStopError,
        continueOnDestroyError: resolved.shutdown.continueOnDestroyError,
        contextStorage,
      },
    );

    return createRuntime(
      {
        application: context,
        configuration,
        logger,
        moduleRegistry,
        moduleLoader,
        moduleLifecycle,
        signalTarget: options.signalTarget,
        contextStorage,
      },
      runtimeOptions,
    );
  };

  const lifecycle = new Lifecycle({ logger });

  for (const participant of options.participants ?? []) {
    lifecycle.register(participant);
  }

  const application = await Application.create({
    context,
    lifecycle,
    runtime: createApplicationRuntime,
  });

  if (options.autoStart) {
    await application.start();
  }

  return application;
}
