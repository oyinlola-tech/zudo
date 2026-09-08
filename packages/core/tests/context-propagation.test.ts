import { describe, it, expect } from "vitest";
import { EventEmitter } from "node:events";
import * as core from "../src/index.js";
import {
  ApplicationContext,
  ConsoleLogger,
  Container,
  RuntimeState,
  createApplication,
  createConfigurationManager,
  createContextStorage,
  createExecutionContext,
  createModuleLifecycleManager,
  createModuleLoader,
  createModuleRegistry,
  createRuntime,
  createToken,
  defineModule,
  getDefaultContextStorage,
} from "../src/index.js";
import type {
  ContextStorage,
  ExecutionContext,
  Module,
  ModuleContext,
  RuntimeDependencies,
  RuntimeSignalTarget,
} from "../src/index.js";

const quietLogger = new ConsoleLogger({ level: "fatal", structured: true });

const signalTarget = () => new EventEmitter() as unknown as RuntimeSignalTarget;

interface Harness {
  readonly dependencies: RuntimeDependencies;
  readonly container: Container;
  readonly storage: ContextStorage;
}

/**
 * Builds the runtime dependency graph by hand (as tests of
 * createRuntime do), threading one ContextStorage through the
 * container, application context, and module lifecycle.
 */
async function createHarness(
  modules: readonly Module[],
  storage: ContextStorage = getDefaultContextStorage(),
): Promise<Harness> {
  const registry = createModuleRegistry();
  const configuration = createConfigurationManager();
  await configuration.initialize();
  const container = new Container({ currentScope: () => storage.get() });
  const application = new ApplicationContext({
    container,
    configuration: configuration.getConfiguration(),
    modules: registry,
    logger: quietLogger,
    contextStorage: storage,
  });

  for (const module of modules) {
    registry.register(
      defineModule({
        id: module.id,
        name: module.name,
        dependencies: module.dependencies,
        factory: () => module,
      }),
    );
  }

  const moduleLoader = createModuleLoader(registry, {
    application,
    configuration,
    logger: quietLogger,
  });
  const moduleLifecycle = createModuleLifecycleManager(registry, moduleLoader, {
    contextStorage: storage,
  });

  return {
    container,
    storage,
    dependencies: {
      application,
      configuration,
      logger: quietLogger,
      moduleRegistry: registry,
      moduleLoader,
      moduleLifecycle,
      signalTarget: signalTarget(),
      contextStorage: storage,
    },
  };
}

describe("runtime execution-context propagation", () => {
  it("makes the runtime context visible inside every module hook", async () => {
    const storage = createContextStorage();
    const seen = new Map<string, ExecutionContext | undefined>();
    const module: Module = {
      id: "users",
      name: "Users",
      onInitialize: () => {
        seen.set("onInitialize", storage.get());
      },
      onReady: () => {
        seen.set("onReady", storage.get());
      },
      onShutdown: () => {
        seen.set("onShutdown", storage.get());
      },
      onDestroy: () => {
        seen.set("onDestroy", storage.get());
      },
    };
    const harness = await createHarness([module], storage);
    const runtime = createRuntime(harness.dependencies, { mode: "test" });

    expect(runtime.contextStorage).toBe(storage);
    expect(storage.get()).toBeUndefined();

    await runtime.start();
    await runtime.stop();

    expect(storage.get()).toBeUndefined();
    expect(runtime.state).toBe(RuntimeState.STOPPED);

    const phases = {
      onInitialize: "initializing",
      onReady: "starting",
      onShutdown: "stopping",
      onDestroy: "destroying",
    } as const;

    for (const [hook, phase] of Object.entries(phases)) {
      const context = seen.get(hook);
      expect(context, hook).toBeDefined();
      /* Derived from the runtime context: same execution, same runtime. */
      expect(context?.executionId).toBe(runtime.context.executionId);
      expect(context?.metadata.runtimeId).toBe(runtime.identity.id);
      expect(context?.metadata.runtimeName).toBe(runtime.identity.name);
      expect(context?.service).toBe(runtime.identity.name);
      /* Per-hook derivation. */
      expect(context?.module).toBe("users");
      expect(context?.operation).toBe(hook);
      expect(context?.metadata.moduleId).toBe("users");
      expect(context?.metadata.phase).toBe(phase);
    }
  });

  it("uses the default storage when none is injected", async () => {
    let observed: ExecutionContext | undefined;
    const harness = await createHarness([
      {
        id: "a",
        name: "a",
        onReady: () => {
          observed = getDefaultContextStorage().get();
        },
      },
    ]);
    const runtime = createRuntime(harness.dependencies, { mode: "test" });

    expect(runtime.contextStorage).toBe(getDefaultContextStorage());
    await runtime.start();
    expect(observed?.executionId).toBe(runtime.identity.id);
    expect(observed?.metadata.moduleId).toBe("a");
    await runtime.stop();
  });

  it("keeps the context across awaits inside a hook and in container factories", async () => {
    const storage = createContextStorage();
    const ServiceToken = createToken<{ readonly context?: ExecutionContext }>(
      "Service",
    );
    let afterAwait: ExecutionContext | undefined;
    let afterTimer: ExecutionContext | undefined;
    let fromFactory: ExecutionContext | undefined;

    const module: Module = {
      id: "svc",
      name: "svc",
      onInitialize: async (context: ModuleContext) => {
        await Promise.resolve();
        afterAwait = storage.get();
        await new Promise((resolve) => setTimeout(resolve, 5));
        afterTimer = storage.get();

        const container = context.application.getContainer();
        container.register(ServiceToken, {
          useFactory: () => ({ context: storage.get() }),
        });
        fromFactory = container.resolve(ServiceToken).context;
      },
    };
    const harness = await createHarness([module], storage);
    const runtime = createRuntime(harness.dependencies, { mode: "test" });

    await runtime.start();

    for (const context of [afterAwait, afterTimer, fromFactory]) {
      expect(context?.executionId).toBe(runtime.identity.id);
      expect(context?.metadata.moduleId).toBe("svc");
      expect(context?.metadata.phase).toBe("initializing");
    }
    await runtime.stop();
  });

  it("runs the failure unwind inside the runtime context", async () => {
    const storage = createContextStorage();
    let shutdownContext: ExecutionContext | undefined;
    const harness = await createHarness(
      [
        {
          id: "ok",
          name: "ok",
          onDestroy: () => {
            shutdownContext = storage.get();
          },
        },
        {
          id: "bad",
          name: "bad",
          dependencies: ["ok"],
          onInitialize: () => {
            throw new Error("boom");
          },
        },
      ],
      storage,
    );
    const runtime = createRuntime(harness.dependencies, { mode: "test" });

    await expect(runtime.start()).rejects.toThrow();
    expect(runtime.state).toBe(RuntimeState.FAILED);
    expect(shutdownContext?.executionId).toBe(runtime.identity.id);
    expect(shutdownContext?.metadata.moduleId).toBe("ok");
    expect(shutdownContext?.metadata.phase).toBe("destroying");
    expect(runtime.timing.failedAt).toBeInstanceOf(Date);
    await runtime.stop();
  });

  it("invokes hooks directly when the lifecycle manager runs outside any context", async () => {
    const storage = createContextStorage();
    let observed: ExecutionContext | undefined = createExecutionContext();
    const harness = await createHarness(
      [
        {
          id: "solo",
          name: "solo",
          onInitialize: () => {
            observed = storage.get();
          },
        },
      ],
      storage,
    );

    await harness.dependencies.moduleLoader.loadAll();
    const result = await harness.dependencies.moduleLifecycle.initialize();

    expect(result.completed).toEqual(["solo"]);
    expect(observed).toBeUndefined();
  });
});

describe("application execution-context propagation", () => {
  it("runs lifecycle participants and module hooks inside the runtime context", async () => {
    const storage = createContextStorage();
    const seen: Record<string, ExecutionContext | undefined> = {};
    const app = await createApplication({
      logger: quietLogger,
      contextStorage: storage,
      signalTarget: signalTarget(),
      modules: [
        defineModule({
          id: "users",
          name: "Users",
          factory: () => ({
            id: "users",
            name: "Users",
            onInitialize: () => {
              seen.moduleInitialize = storage.get();
            },
            onShutdown: () => {
              seen.moduleShutdown = storage.get();
            },
          }),
        }),
      ],
      participants: [
        {
          name: "http",
          start: () => {
            seen.participantStart = storage.get();
          },
          stop: () => {
            seen.participantStop = storage.get();
          },
        },
      ],
      runtime: { name: "svc", mode: "test" },
    });

    expect(app.applicationContext?.getContextStorage()).toBe(storage);

    await app.start();
    const firstRuntime = app.applicationRuntime!;
    expect(firstRuntime.contextStorage).toBe(storage);
    expect(seen.participantStart).toBe(firstRuntime.context);
    expect(seen.moduleInitialize?.executionId).toBe(firstRuntime.identity.id);
    expect(seen.moduleInitialize?.metadata.moduleId).toBe("users");
    expect(storage.get()).toBeUndefined();

    await app.stop();
    expect(seen.participantStop).toBe(firstRuntime.context);
    expect(seen.moduleShutdown?.executionId).toBe(firstRuntime.identity.id);
    expect(seen.moduleShutdown?.metadata.phase).toBe("stopping");

    /* A restart gets a fresh runtime and therefore a fresh context. */
    await app.start();
    const secondRuntime = app.applicationRuntime!;
    expect(secondRuntime).not.toBe(firstRuntime);
    expect(seen.participantStart).toBe(secondRuntime.context);
    expect(seen.participantStart?.executionId).not.toBe(
      firstRuntime.context.executionId,
    );
    await app.shutdown();
    expect(storage.get()).toBeUndefined();
  });

  it("uses the default storage for createApplication by default", async () => {
    let observed: ExecutionContext | undefined;
    const app = await createApplication({
      logger: quietLogger,
      signalTarget: signalTarget(),
      modules: [
        defineModule({
          id: "m",
          name: "m",
          factory: () => ({
            id: "m",
            name: "m",
            onReady: () => {
              observed = getDefaultContextStorage().get();
            },
          }),
        }),
      ],
      runtime: { mode: "test" },
      autoStart: true,
    });

    expect(observed?.executionId).toBe(app.applicationRuntime?.identity.id);
    await app.shutdown();
  });

  it("scopes container lifetimes to the execution context", async () => {
    const storage = createContextStorage();
    const ScopedToken = createToken<object>("Scoped");
    const app = await createApplication({
      logger: quietLogger,
      contextStorage: storage,
      signalTarget: signalTarget(),
      runtime: { mode: "test" },
    });
    const container = app.applicationContext!.getContainer();
    container.register(ScopedToken, { useFactory: () => ({}) }, "scoped");

    /* No execution context: scoped behaves as transient. */
    expect(container.resolve(ScopedToken)).not.toBe(
      container.resolve(ScopedToken),
    );

    const first = await storage.run(
      createExecutionContext({ operation: "request-1" }),
      async () => {
        const instance = container.resolve(ScopedToken);
        await Promise.resolve();
        expect(container.resolve(ScopedToken)).toBe(instance);
        return instance;
      },
    );
    const second = storage.run(
      createExecutionContext({ operation: "request-2" }),
      () => container.resolve(ScopedToken),
    );

    expect(first).not.toBe(second);

    /* During start the runtime context is the scope. */
    await app.start();
    await app.shutdown();
  });

  it("scopes container lifetimes to the runtime context during bootstrap", async () => {
    const storage = createContextStorage();
    const ScopedToken = createToken<object>("Scoped");
    const instances: object[] = [];
    const app = await createApplication({
      logger: quietLogger,
      contextStorage: storage,
      signalTarget: signalTarget(),
      modules: ["a", "b"].map((id) =>
        defineModule({
          id,
          name: id,
          factory: () => ({
            id,
            name: id,
            onInitialize: (context: ModuleContext) => {
              instances.push(
                context.application.getContainer().resolve(ScopedToken),
              );
            },
          }),
        }),
      ),
      runtime: { mode: "test" },
    });
    app
      .applicationContext!.getContainer()
      .register(ScopedToken, { useFactory: () => ({}) }, "scoped");

    await app.start();

    /*
     * Each hook runs in its own derived context object, so scoped
     * instances are per hook invocation; a second resolve inside the
     * same hook would return the same instance (covered above).
     */
    expect(instances).toHaveLength(2);
    expect(instances[0]).not.toBe(instances[1]);
    await app.shutdown();
  });
});

describe("logger execution-context integration", () => {
  function capture(): { lines: string[]; restore: () => void } {
    const lines: string[] = [];
    const original = console.info;
    console.info = (line: string) => {
      lines.push(line);
    };
    return {
      lines,
      restore: () => {
        console.info = original;
      },
    };
  }

  it("merges executionId and runtimeId from the active context", () => {
    const storage = createContextStorage();
    const logger = new ConsoleLogger({
      level: "info",
      structured: true,
      contextStorage: storage,
      context: { app: "zudo" },
    });
    const out = capture();

    try {
      logger.info("outside");
      storage.run(
        createExecutionContext({
          executionId: "exec-1",
          correlationId: "corr-1",
          metadata: { runtimeId: "rt-1" },
        }),
        () => {
          logger.info("inside");
          logger.child({ moduleId: "users" }).info("child");
          logger.info("explicit wins", { executionId: "override" });
        },
      );
    } finally {
      out.restore();
    }

    const entries = out.lines.map(
      (line) => JSON.parse(line) as { context?: Record<string, unknown> },
    );
    expect(entries[0]?.context).toEqual({ app: "zudo" });
    expect(entries[1]?.context).toEqual({
      executionId: "exec-1",
      correlationId: "corr-1",
      runtimeId: "rt-1",
      app: "zudo",
    });
    expect(entries[2]?.context).toMatchObject({
      executionId: "exec-1",
      runtimeId: "rt-1",
      moduleId: "users",
    });
    expect(entries[3]?.context?.executionId).toBe("override");
  });

  it("stamps runtime log entries with the runtime execution id", async () => {
    const storage = createContextStorage();
    const logger = new ConsoleLogger({
      level: "info",
      structured: true,
      contextStorage: storage,
    });
    const out = capture();
    let app;
    try {
      app = await createApplication({
        logger,
        contextStorage: storage,
        signalTarget: signalTarget(),
        runtime: { name: "svc", mode: "test" },
        autoStart: true,
      });
    } finally {
      out.restore();
    }

    const runtimeId = app.applicationRuntime!.identity.id;
    const bootstrapLines = out.lines
      .map(
        (line) =>
          JSON.parse(line) as {
            message: string;
            context?: Record<string, unknown>;
          },
      )
      .filter((entry) => entry.message.startsWith("Runtime bootstrap"));
    expect(bootstrapLines.length).toBeGreaterThan(0);
    for (const entry of bootstrapLines) {
      expect(entry.context?.executionId).toBe(runtimeId);
      expect(entry.context?.runtimeId).toBe(runtimeId);
    }
    await app.shutdown();
  });
});

describe("single execution-context implementation", () => {
  it("no longer exports the former mutable runtime context", () => {
    const exports = core as unknown as Record<string, unknown>;
    expect(exports.DefaultRuntimeContext).toBeUndefined();
    /* `Context` and `RuntimeContext` survive only as type aliases. */
    expect(exports.Context).toBeUndefined();
    expect(exports.RuntimeContext).toBeUndefined();
    expect(exports.createRuntimeContext).toBe(
      exports.createRuntimeExecutionContext,
    );
    expect(exports.createContext).toBe(exports.createExecutionContext);
  });
});
