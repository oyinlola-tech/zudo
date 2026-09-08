import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import {
  Application,
  ApplicationContext,
  Lifecycle,
  createApplication,
  createRuntime,
  defineModule,
  createModuleRegistry,
  createModuleLoader,
  createModuleLifecycleManager,
  createConfigurationManager,
  ConsoleLogger,
  Container,
  RuntimeState,
  InvalidStateError,
} from "../src/index.js";
import type {
  Module,
  Runtime,
  RuntimeDependencies,
  RuntimeSignalTarget,
} from "../src/index.js";

const quietLogger = new ConsoleLogger({ level: "fatal", structured: true });

function trackedModule(id: string, events: string[]): Module {
  return {
    id,
    name: id,
    onInitialize: () => {
      events.push(`${id}:initialize`);
    },
    onReady: () => {
      events.push(`${id}:start`);
    },
    onShutdown: () => {
      events.push(`${id}:stop`);
    },
    onDestroy: () => {
      events.push(`${id}:destroy`);
    },
  };
}

async function createDependencies(
  events: string[],
): Promise<RuntimeDependencies> {
  const registry = createModuleRegistry();
  const configuration = createConfigurationManager();
  await configuration.initialize();
  const application = new ApplicationContext({
    container: new Container(),
    configuration: configuration.getConfiguration(),
    modules: registry,
    logger: quietLogger,
  });
  registry.register(
    defineModule({
      id: "users",
      name: "users",
      factory: () => trackedModule("users", events),
    }),
  );
  const moduleLoader = createModuleLoader(registry, {
    application,
    configuration,
    logger: quietLogger,
  });
  return {
    application,
    configuration,
    logger: quietLogger,
    moduleRegistry: registry,
    moduleLoader,
    moduleLifecycle: createModuleLifecycleManager(registry, moduleLoader),
    signalTarget: new EventEmitter() as unknown as RuntimeSignalTarget,
  };
}

describe("Application", () => {
  it("starts the lifecycle then the runtime, and stops in reverse", async () => {
    const events: string[] = [];
    const lifecycle = new Lifecycle();
    lifecycle.register({
      name: "http",
      start: () => {
        events.push("http:start");
      },
      stop: () => {
        events.push("http:stop");
      },
    });
    const runtime = createRuntime(await createDependencies(events), {
      name: "app",
      mode: "test",
    });

    const app = await Application.create({ lifecycle, runtime });
    expect(app.state).toBe("initialized");

    await app.start();
    expect(app.state).toBe("running");
    expect(runtime.state).toBe(RuntimeState.READY);
    expect(events).toEqual(["http:start", "users:initialize", "users:start"]);

    await app.stop();
    expect(app.state).toBe("stopped");
    expect(runtime.state).toBe(RuntimeState.STOPPED);
    expect(events.slice(3)).toEqual([
      "users:stop",
      "users:destroy",
      "http:stop",
    ]);
  });

  it("restarts with a runtime factory", async () => {
    const events: string[] = [];
    const dependencies = await createDependencies(events);
    const runtimes: Runtime[] = [];
    const lifecycle = new Lifecycle();
    const startFn = vi.fn();
    lifecycle.register({ name: "svc", start: startFn });

    const app = await Application.create({
      lifecycle,
      runtime: () => {
        // Fresh loader + lifecycle manager per runtime, as createApplication does.
        for (const registration of dependencies.moduleRegistry.getAll()) {
          dependencies.moduleLoader.unload(registration.definition.id);
        }
        const moduleLoader = createModuleLoader(dependencies.moduleRegistry, {
          application: dependencies.application,
          configuration: dependencies.configuration,
          logger: quietLogger,
        });
        const runtime = createRuntime(
          {
            ...dependencies,
            moduleLoader,
            moduleLifecycle: createModuleLifecycleManager(
              dependencies.moduleRegistry,
              moduleLoader,
            ),
          },
          { mode: "test" },
        );
        runtimes.push(runtime);
        return runtime;
      },
    });

    await app.start();
    await app.stop();
    await app.start();

    expect(app.state).toBe("running");
    expect(runtimes).toHaveLength(2);
    expect(app.applicationRuntime).toBe(runtimes[1]);
    expect(runtimes[0]!.state).toBe(RuntimeState.STOPPED);
    expect(runtimes[1]!.state).toBe(RuntimeState.READY);
    expect(startFn).toHaveBeenCalledTimes(2);
    expect(events).toEqual([
      "users:initialize",
      "users:start",
      "users:stop",
      "users:destroy",
      "users:initialize",
      "users:start",
    ]);

    await app.shutdown();
    expect(app.state).toBe("stopped");
    await expect(app.start()).rejects.toThrow(InvalidStateError);
  });

  it("refuses to restart a single-use runtime instance", async () => {
    const runtime = createRuntime(await createDependencies([]), {
      mode: "test",
    });
    const app = await Application.create({ runtime });

    await app.start();
    await app.stop();

    await expect(app.start()).rejects.toThrow(InvalidStateError);
    await expect(app.start()).rejects.toThrow(/cannot be restarted/);
    expect(app.state).toBe("stopped");
  });

  it("restarts a lifecycle-only application", async () => {
    const lifecycle = new Lifecycle();
    const start = vi.fn();
    lifecycle.register({ name: "svc", start });
    const app = await Application.create({ lifecycle });

    await app.start();
    await app.stop();
    await app.start();

    expect(app.state).toBe("running");
    expect(start).toHaveBeenCalledTimes(2);
  });

  it("marks the application failed when the runtime fails to start", async () => {
    const events: string[] = [];
    const dependencies = await createDependencies(events);
    vi.spyOn(dependencies.moduleLoader, "loadAll").mockRejectedValue(
      new Error("load failed"),
    );
    const app = await Application.create({
      runtime: createRuntime(dependencies, { mode: "test" }),
    });

    await expect(app.start()).rejects.toThrow(
      "Failed to load runtime modules.",
    );
    expect(app.state).toBe("failed");
    await app.stop();
    expect(app.state).toBe("stopped");
  });

  it("exposes the application context", () => {
    const context = new ApplicationContext({
      container: new Container(),
      configuration: {} as never,
      modules: createModuleRegistry(),
      logger: quietLogger,
    });
    expect(context.getLogger()).toBe(quietLogger);
    expect(context.getContainer()).toBeInstanceOf(Container);
  });
});

describe("createApplication", () => {
  it("wires the whole graph and supports the README flow", async () => {
    const events: string[] = [];
    const app = await createApplication({
      logger: quietLogger,
      signalTarget: new EventEmitter() as unknown as RuntimeSignalTarget,
      modules: [
        defineModule({
          id: "users",
          name: "Users",
          factory: () => trackedModule("users", events),
        }),
      ],
      participants: [
        {
          name: "http",
          start: () => {
            events.push("http:start");
          },
          stop: () => {
            events.push("http:stop");
          },
        },
      ],
      runtime: {
        name: "my-service",
        mode: "test",
        signals: { handleSigint: true, handleSigterm: true },
      },
    });

    expect(app.state).toBe("initialized");
    expect(app.applicationContext).toBeInstanceOf(ApplicationContext);
    expect(app.applicationContext?.getModules().has("users")).toBe(true);

    await app.start();
    expect(app.applicationRuntime?.identity.name).toBe("my-service");
    expect(app.applicationRuntime?.state).toBe(RuntimeState.READY);
    expect(app.applicationRuntime?.requireModule("users").name).toBe("users");

    await app.stop();
    await app.start();
    expect(app.state).toBe("running");
    expect(events).toEqual([
      "http:start",
      "users:initialize",
      "users:start",
      "users:stop",
      "users:destroy",
      "http:stop",
      "http:start",
      "users:initialize",
      "users:start",
    ]);

    await app.shutdown();
    expect(app.state).toBe("stopped");
    expect(app.applicationRuntime?.state).toBe(RuntimeState.STOPPED);
  });

  it("passes runtime continueOn*Error flags down to the module lifecycle", async () => {
    const app = await createApplication({
      logger: { level: "fatal", structured: true },
      signalTarget: new EventEmitter() as unknown as RuntimeSignalTarget,
      modules: [
        defineModule({
          id: "bad",
          name: "bad",
          factory: () => ({
            id: "bad",
            name: "bad",
            onReady: () => {
              throw new Error("bad start");
            },
          }),
        }),
      ],
      runtime: { mode: "test", startup: { continueOnStartError: true } },
      autoStart: true,
    });

    expect(app.state).toBe("running");
    const bootstrap = app.applicationRuntime!.getStatus().bootstrap!;
    expect(bootstrap.success).toBe(false);
    expect(bootstrap.errors[0]?.moduleName).toBe("bad");
    await app.shutdown();
  });

  it("uses a pre-initialized configuration manager and registry", async () => {
    const configuration = createConfigurationManager();
    await configuration.initialize();
    const moduleRegistry = createModuleRegistry();

    const app = await createApplication({
      configuration,
      moduleRegistry,
      logger: quietLogger,
      signalTarget: new EventEmitter() as unknown as RuntimeSignalTarget,
      runtime: { mode: "test" },
    });

    expect(app.applicationContext?.getModules()).toBe(moduleRegistry);
    expect(app.applicationContext?.getConfiguration()).toBe(
      configuration.getConfiguration(),
    );
    await app.start();
    expect(app.applicationRuntime?.getConfiguration()).toBe(configuration);
    await app.shutdown();
  });
});
