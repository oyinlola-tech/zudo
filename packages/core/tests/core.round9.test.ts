import { describe, it, expect } from "vitest";
import { EventEmitter } from "node:events";
import { isRuntimeError as isErrorsRuntimeError } from "@zudojs/errors";

import {
  Application,
  ApplicationContext,
  BaseModule,
  ConfigurationRegistry,
  ConsoleLogger,
  Container,
  Lifecycle,
  MissingModuleDependencyError,
  ModuleError,
  RuntimeState,
  createApplication,
  createConfigurationManager,
  createConfigurationSource,
  createContext,
  createContextStorage,
  createContextValues,
  createContextKey,
  createExecutionContext,
  createLogRedactor,
  createModuleLifecycleManager,
  createModuleLoader,
  createModuleRegistry,
  createRuntime,
  createRuntimeContext,
  defineModule,
  getDefaultContextStorage,
  isRuntimeError,
  resolveRuntimeOptions,
  safeLogStringify,
  sanitizeLogValue,
} from "../src/index.js";
import type {
  Configuration,
  Module,
  ModuleContext,
  ModuleId,
  ModuleLifecycleManager,
  ModuleLoader,
  ModuleRegistry,
  RuntimeDependencies,
  RuntimeSignalTarget,
} from "../src/index.js";

const quiet = new ConsoleLogger({ level: "fatal" });

interface Graph {
  readonly registry: ModuleRegistry;
  readonly loader: ModuleLoader;
  readonly lifecycle: ModuleLifecycleManager;
  readonly dependencies: RuntimeDependencies;
  readonly signalTarget: EventEmitter;
}

async function createGraph(
  lifecycleOptions: Parameters<typeof createModuleLifecycleManager>[2] = {},
): Promise<Graph> {
  const registry = createModuleRegistry();
  const configuration = createConfigurationManager();
  await configuration.initialize();
  const application = new ApplicationContext({
    container: new Container(),
    configuration: configuration.getConfiguration(),
    modules: registry,
    logger: quiet,
  });
  const loader = createModuleLoader(registry, {
    application,
    configuration,
    logger: quiet,
  });
  const lifecycle = createModuleLifecycleManager(
    registry,
    loader,
    lifecycleOptions,
  );
  const signalTarget = new EventEmitter();
  return {
    registry,
    loader,
    lifecycle,
    signalTarget,
    dependencies: {
      application,
      configuration,
      logger: quiet,
      moduleRegistry: registry,
      moduleLoader: loader,
      moduleLifecycle: lifecycle,
      signalTarget: signalTarget as unknown as RuntimeSignalTarget,
    },
  };
}

function recordingModule(
  id: ModuleId,
  events: string[],
  options: {
    readonly failOn?: "initialize" | "start";
    readonly dependencies?: readonly ModuleId[];
  } = {},
): Module {
  const hook = (phase: string) => async () => {
    events.push(`${id}:${phase}`);
    if (options.failOn === phase) throw new Error(`${id} ${phase} boom`);
  };
  return {
    id,
    name: id,
    dependencies: options.dependencies,
    onInitialize: hook("initialize"),
    onReady: hook("start"),
    onShutdown: hook("stop"),
    onDestroy: hook("destroy"),
  };
}

describe("CORE-R9-01 runtime mode/role are validated when options are resolved", () => {
  it("rejects an unknown mode", () => {
    expect(() => resolveRuntimeOptions({ mode: "bogus" as never })).toThrow(
      TypeError,
    );
    expect(() => resolveRuntimeOptions({ mode: "bogus" as never })).toThrow(
      /Invalid runtime mode "bogus"/,
    );
  });

  it("rejects an unknown role through createRuntime", async () => {
    const graph = await createGraph();
    expect(() =>
      createRuntime(graph.dependencies, { role: "nope" as never }),
    ).toThrow(/Invalid runtime role "nope"/);
  });

  it("still accepts every documented mode and role", () => {
    for (const mode of ["development", "test", "production"] as const) {
      expect(resolveRuntimeOptions({ mode }).mode).toBe(mode);
    }
    for (const role of [
      "application",
      "api",
      "worker",
      "scheduler",
      "cli",
    ] as const) {
      expect(resolveRuntimeOptions({ role }).role).toBe(role);
    }
  });
});

describe("CORE-R9-02 container drops scoped instances with the provider", () => {
  it("does not serve a stale scoped instance after unregister + register", () => {
    const container = new Container();
    const scope = container.createScope();
    container.register("svc", { useFactory: () => ({ v: 1 }) }, "scoped");
    expect(scope.resolve<{ v: number }>("svc").v).toBe(1);

    container.unregister("svc");
    container.register("svc", { useFactory: () => ({ v: 2 }) }, "scoped");

    expect(scope.resolve<{ v: number }>("svc").v).toBe(2);
    // The new registration caches per scope like before.
    expect(scope.resolve<{ v: number }>("svc")).toBe(scope.resolve("svc"));
  });

  it("clear() forgets scoped instances too", () => {
    const key = {};
    const container = new Container({ currentScope: () => key });
    container.register("svc", { useFactory: () => ({ v: 1 }) }, "scoped");
    expect(container.resolve<{ v: number }>("svc").v).toBe(1);

    container.clear();
    container.register("svc", { useFactory: () => ({ v: 2 }) }, "scoped");

    expect(container.resolve<{ v: number }>("svc").v).toBe(2);
  });
});

describe("CORE-R9-03 ApplicationContext reflects configuration reloads", () => {
  it("createApplication hands out the reloaded configuration", async () => {
    let value = 1;
    const registry = new ConfigurationRegistry();
    registry.registerSource(
      createConfigurationSource({
        name: "dynamic",
        type: "custom",
        load: async () => [{ path: "feature.limit", value }],
      }),
    );
    const configuration = createConfigurationManager({ registry });
    const app = await createApplication({ configuration, logger: quiet });
    const context = app.applicationContext!;

    expect(context.getConfiguration().get("feature.limit")).toBe(1);
    expect(context.getConfiguration()).toBe(configuration.getConfiguration());

    value = 2;
    await configuration.reload();

    expect(context.getConfiguration().get("feature.limit")).toBe(2);
    expect(context.getConfiguration()).toBe(configuration.getConfiguration());
  });

  it("still accepts a plain Configuration snapshot", async () => {
    const configuration = createConfigurationManager();
    await configuration.initialize();
    const snapshot: Configuration = configuration.getConfiguration();
    const context = new ApplicationContext({
      container: new Container(),
      configuration: snapshot,
      modules: createModuleRegistry(),
      logger: quiet,
    });
    expect(context.getConfiguration()).toBe(snapshot);
  });
});

describe("CORE-R9-04 ConfigurationManager serialises overlapping reloads", () => {
  it("shares one in-flight reload instead of throwing", async () => {
    let loads = 0;
    let value = 1;
    const registry = new ConfigurationRegistry();
    registry.registerSource(
      createConfigurationSource({
        name: "slow",
        type: "custom",
        load: async () => {
          loads += 1;
          await new Promise((resolve) => setTimeout(resolve, 15));
          return [{ path: "a", value }];
        },
      }),
    );
    const manager = createConfigurationManager({ registry });
    await manager.initialize();
    expect(loads).toBe(1);

    const reloaded: string[] = [];
    manager.on("configuration.reloaded", () => {
      reloaded.push("reloaded");
    });

    value = 2;
    const [first, second] = await Promise.all([
      manager.reload(),
      manager.reload(),
    ]);

    expect(first).toBe(second);
    expect(loads).toBe(2);
    expect(reloaded).toEqual(["reloaded"]);
    expect(manager.get("a")).toBe(2);

    // A reload after the shared one completes runs again.
    value = 3;
    await manager.reload();
    expect(loads).toBe(3);
    expect(manager.get("a")).toBe(3);
  });
});

describe("CORE-R9-05 runtime continueOn*Error flags reach the module lifecycle manager", () => {
  it("keeps healthy modules running when the runtime is permissive and the manager is not", async () => {
    const events: string[] = [];
    const graph = await createGraph(); // manager defaults: strict
    graph.registry.register(
      defineModule({
        id: "a",
        name: "a",
        factory: () => recordingModule("a", events),
      }),
    );
    graph.registry.register(
      defineModule({
        id: "b",
        name: "b",
        factory: () => recordingModule("b", events, { failOn: "initialize" }),
      }),
    );
    const runtime = createRuntime(graph.dependencies, {
      mode: "test",
      startup: { continueOnInitializeError: true },
      diagnostics: { startupLogging: false, shutdownLogging: false },
    });

    await runtime.start();

    expect(runtime.state).toBe(RuntimeState.READY);
    expect(graph.lifecycle.getState("a")?.phase).toBe("started");
    expect(graph.lifecycle.getState("b")?.phase).toBe("failed");
    expect(events).toEqual(["a:initialize", "b:initialize", "a:start"]);

    const bootstrap = runtime.getStatus().bootstrap!;
    expect(bootstrap.success).toBe(false);
    expect(bootstrap.initializedModules).toBe(1);
    expect(bootstrap.startedModules).toBe(1);
    expect(bootstrap.errors.map((e) => e.moduleName)).toEqual(["b"]);

    await runtime.stop();
    expect(events.slice(3)).toEqual(["a:stop", "b:destroy", "a:destroy"]);
  });

  it("applies the same relaxation to continueOnStartError", async () => {
    const events: string[] = [];
    const graph = await createGraph();
    graph.registry.register(
      defineModule({
        id: "a",
        name: "a",
        factory: () => recordingModule("a", events),
      }),
    );
    graph.registry.register(
      defineModule({
        id: "b",
        name: "b",
        factory: () => recordingModule("b", events, { failOn: "start" }),
      }),
    );
    const runtime = createRuntime(graph.dependencies, {
      mode: "test",
      startup: { continueOnStartError: true },
      diagnostics: { startupLogging: false, shutdownLogging: false },
    });

    await runtime.start();

    expect(runtime.state).toBe(RuntimeState.READY);
    expect(graph.lifecycle.isStarted("a")).toBe(true);
    expect(runtime.getStatus().bootstrap!.startedModules).toBe(1);
    await runtime.stop();
  });

  it("per-call phase options override the manager's own setting", async () => {
    const events: string[] = [];
    const graph = await createGraph({ continueOnInitializeError: false });
    graph.registry.register(
      defineModule({
        id: "a",
        name: "a",
        factory: () => recordingModule("a", events),
      }),
    );
    graph.registry.register(
      defineModule({
        id: "b",
        name: "b",
        factory: () => recordingModule("b", events, { failOn: "initialize" }),
      }),
    );
    await graph.loader.loadAll();

    const result = await graph.lifecycle.initialize({ continueOnError: true });

    expect(result.completed).toEqual(["a"]);
    expect(result.failed).toEqual(["b"]);
    expect(graph.lifecycle.isInitialized("a")).toBe(true);
  });
});

describe("CORE-R9-06 unloaded definitions cannot break lifecycle phases", () => {
  it("initializes loaded modules although an autoLoad:false module has a missing dependency", async () => {
    const events: string[] = [];
    const graph = await createGraph();
    graph.registry.register(
      defineModule({
        id: "a",
        name: "a",
        factory: () => recordingModule("a", events),
      }),
    );
    graph.registry.register(
      defineModule({
        id: "lazy",
        name: "lazy",
        autoLoad: false,
        dependencies: ["not-registered"],
        factory: () => recordingModule("lazy", events),
      }),
    );

    const load = await graph.loader.loadAll();
    expect(load.loaded.map((m) => m.id)).toEqual(["a"]);
    expect(load.skipped).toEqual(["lazy"]);

    const initialized = await graph.lifecycle.initialize();
    expect(initialized.completed).toEqual(["a"]);
    const started = await graph.lifecycle.start();
    expect(started.completed).toEqual(["a"]);
    const stopped = await graph.lifecycle.stop();
    expect(stopped.completed).toEqual(["a"]);
    const destroyed = await graph.lifecycle.destroy();
    expect(destroyed.completed).toEqual(["a"]);
  });

  it("ignores a cycle between unloaded definitions", async () => {
    const events: string[] = [];
    const graph = await createGraph();
    graph.registry.register(
      defineModule({
        id: "a",
        name: "a",
        factory: () => recordingModule("a", events),
      }),
    );
    graph.registry.register(
      defineModule({
        id: "x",
        name: "x",
        autoLoad: false,
        dependencies: ["y"],
        factory: () => recordingModule("x", events),
      }),
    );
    graph.registry.register(
      defineModule({
        id: "y",
        name: "y",
        autoLoad: false,
        dependencies: ["x"],
        factory: () => recordingModule("y", events),
      }),
    );

    await graph.loader.loadAll();
    const result = await graph.lifecycle.startApplication();
    expect(result.started.completed).toEqual(["a"]);
  });
});

describe("CORE-R9-07 sanitizeLogValue keeps own __proto__ keys as data", () => {
  it("preserves the key and does not touch Object.prototype", () => {
    const input = JSON.parse('{"__proto__": {"polluted": true}, "ok": 1}');
    const output = sanitizeLogValue(input) as Record<string, unknown>;

    const descriptor = Object.getOwnPropertyDescriptor(output, "__proto__");
    expect(descriptor?.value).toEqual({ polluted: true });
    expect(Object.getPrototypeOf(output)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(JSON.parse(safeLogStringify(input))).toEqual({
      ["__proto__"]: { polluted: true },
      ok: 1,
    });
  });
});

describe("CORE-R9-08 instance-declared Module.dependencies are honoured", () => {
  class A extends BaseModule {
    public readonly id = "a";
    public readonly name = "a";
    public constructor(private readonly events: string[]) {
      super();
    }
    public override async onInitialize(): Promise<void> {
      this.events.push("a:initialize");
    }
  }

  class B extends BaseModule {
    public readonly id = "b";
    public readonly name = "b";
    public sawA = false;
    public constructor(private readonly events: string[]) {
      super({ dependencies: ["a"] });
    }
    public override async onInitialize(context: ModuleContext): Promise<void> {
      this.events.push("b:initialize");
      this.sawA = context.hasModule("a");
      expect(context.getModuleContext("a")?.id).toBe("a");
    }
    public override async onShutdown(): Promise<void> {
      this.events.push("b:stop");
    }
  }

  it("orders and exposes dependencies declared only on the instance", async () => {
    const events: string[] = [];
    const graph = await createGraph();
    let b: B | undefined;
    // Registered dependent-first so definition order alone would be wrong.
    graph.registry.register(
      defineModule({
        id: "b",
        name: "b",
        factory: () => {
          b = new B(events);
          return b;
        },
      }),
    );
    graph.registry.register(
      defineModule({ id: "a", name: "a", factory: () => new A(events) }),
    );

    await graph.loader.loadAll();
    await graph.lifecycle.startApplication();

    expect(events).toEqual(["a:initialize", "b:initialize"]);
    expect(b?.sawA).toBe(true);

    await expect(graph.lifecycle.unloadModule("a")).rejects.toThrow(
      ModuleError,
    );

    await graph.lifecycle.stopApplication();
  });

  it("loads an autoLoad:false dependency that only the instance declares", async () => {
    const events: string[] = [];
    const graph = await createGraph();
    graph.registry.register(
      defineModule({
        id: "needs-lazy",
        name: "needs-lazy",
        factory: () =>
          recordingModule("needs-lazy", events, { dependencies: ["lazy"] }),
      }),
    );
    graph.registry.register(
      defineModule({
        id: "lazy",
        name: "lazy",
        autoLoad: false,
        factory: () => recordingModule("lazy", events),
      }),
    );

    const result = await graph.loader.loadAll();
    expect(result.loaded.map((m) => m.id).sort()).toEqual([
      "lazy",
      "needs-lazy",
    ]);
    expect(result.skipped).toEqual([]);

    await graph.lifecycle.initialize();
    expect(events).toEqual(["lazy:initialize", "needs-lazy:initialize"]);
  });

  it("fails loading when the instance requires an unregistered module", async () => {
    const events: string[] = [];
    const graph = await createGraph();
    graph.registry.register(
      defineModule({
        id: "orphan",
        name: "orphan",
        factory: () =>
          recordingModule("orphan", events, { dependencies: ["ghost"] }),
      }),
    );

    await expect(graph.loader.loadAll()).rejects.toThrow(
      MissingModuleDependencyError,
    );
  });
});

describe("README examples", () => {
  it("quick start: createApplication with modules and runtime options", async () => {
    const events: string[] = [];
    const app = await createApplication({
      logger: quiet,
      signalTarget: new EventEmitter() as unknown as RuntimeSignalTarget,
      modules: [
        defineModule({
          id: "users",
          name: "Users",
          factory: () => ({
            id: "users",
            name: "Users",
            onInitialize: async () => {
              events.push("init");
              const context = getDefaultContextStorage().require();
              expect(context.metadata.moduleId).toBe("users");
              expect(context.metadata.phase).toBe("initializing");
            },
            onShutdown: async () => {
              events.push("shutdown");
            },
          }),
        }),
      ],
      runtime: {
        name: "my-service",
        mode: "production",
        signals: { handleSigint: true, handleSigterm: true },
        diagnostics: { startupLogging: false, shutdownLogging: false },
      },
    });

    await app.start();
    const runtime = app.applicationRuntime!;
    expect(runtime.context.executionId).toBe(runtime.identity.id);
    expect(runtime.getStatus().bootstrap?.success).toBe(true);
    await app.stop();
    await app.start(); // restart creates a fresh runtime
    expect(app.applicationRuntime).not.toBe(runtime);
    await app.shutdown();
    expect(events).toEqual(["init", "shutdown", "init", "shutdown"]);
    await expect(app.start()).rejects.toThrow();
  });

  it("assembling by hand: Application.create with a Lifecycle and a runtime factory", async () => {
    const graph = await createGraph();
    const lifecycle = new Lifecycle();
    const calls: string[] = [];
    lifecycle.register({
      name: "http-server",
      start: async () => {
        calls.push("listen");
      },
      stop: async () => {
        calls.push("close");
      },
    });
    const app = await Application.create({
      lifecycle,
      runtime: () =>
        createRuntime(graph.dependencies, {
          mode: "test",
          diagnostics: { startupLogging: false, shutdownLogging: false },
        }),
    });
    await app.start();
    await app.stop();
    expect(calls).toEqual(["listen", "close"]);
  });

  it("execution context API as documented", () => {
    const storage = createContextStorage();
    const context = createExecutionContext({ service: "svc" });
    const key = createContextKey<string>("tenant");
    const values = createContextValues().set(key, "acme");

    storage.run(context, () => {
      expect(storage.require().service).toBe("svc");
      storage.runDerived({ operation: "op" }, () => {
        expect(storage.require().operation).toBe("op");
      });
      const snapshot = storage.capture();
      storage.runSnapshot(snapshot, () => {
        expect(storage.require().executionId).toBe(context.executionId);
      });
    });

    storage.runWithValues(context, values, () => {
      expect(storage.getValues()?.get(key)).toBe("acme");
    });

    // Deprecated aliases remain callable.
    expect(createContext().executionId).toBeTypeOf("string");
    expect(typeof createRuntimeContext).toBe("function");
  });

  it("logger and configuration manager options named in the README exist", async () => {
    const logger = new ConsoleLogger({
      level: "info",
      structured: true,
      service: "svc",
      version: "1.0.0",
      environment: "test",
      context: { region: "eu" },
      redact: createLogRedactor(),
      contextStorage: getDefaultContextStorage(),
    });
    expect(typeof logger.child({ moduleId: "x" }).info).toBe("function");

    const manager = createConfigurationManager({
      registry: new ConfigurationRegistry(),
      loaderOptions: { sequential: true },
      validationOptions: { failFast: false },
      redactorOptions: { sensitivePatterns: ["pin"] },
    });
    const off = manager.on("configuration.ready", () => undefined);
    off();
    await manager.initialize();
    expect(manager.getConfiguration().toObject()).toEqual({});
  });

  it("runtime errors are recognised by isRuntimeError from both packages", async () => {
    const graph = await createGraph();
    const runtime = createRuntime(graph.dependencies, {
      mode: "test",
      diagnostics: { startupLogging: false, shutdownLogging: false },
    });
    await runtime.start();
    await runtime.stop();
    const error = await runtime.start().catch((e: unknown) => e);
    expect(isRuntimeError(error)).toBe(true);
    expect(isErrorsRuntimeError(error)).toBe(true);
  });
});
