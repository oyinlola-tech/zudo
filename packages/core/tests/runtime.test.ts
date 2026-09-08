import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import {
  RuntimeError as ErrorsRuntimeError,
  isRuntimeError as errorsIsRuntimeError,
} from "@zudojs/errors";
import {
  createRuntime,
  DefaultRuntime,
  RuntimeState,
  canTransitionRuntime,
  assertRuntimeTransition,
  getNextRuntimeStates,
  canStopRuntime,
  isRuntimeTerminal,
  createRuntimeId,
  createRuntimeIdentity,
  createRuntimeContext,
  createRuntimeExecutionContext,
  createRuntimeEnvironment,
  detectContainer,
  detectHostInfo,
  detectPlatform,
  resolveRuntimeOptions,
  DEFAULT_RUNTIME_OPTIONS,
  RuntimeSignalManager,
  withRuntimeTimeout,
  RuntimeError,
  RuntimeStartError,
  RuntimeStopError,
  RuntimeInitializationError,
  RuntimeLoadError,
  RuntimeTimeoutError,
  RuntimeErrorCode,
  InvalidRuntimeStateError,
  InvalidRuntimeTransitionError,
  MissingEnvironmentVariableError,
  isRuntimeError,
  hasRuntimeErrorCode,
  toRuntimeError,
  createModuleRegistry,
  createModuleLoader,
  createModuleLifecycleManager,
  createConfigurationManager,
  defineModule,
  ModuleNotFoundError,
  ConsoleLogger,
  Container,
  ApplicationContext,
} from "../src/index.js";
import type {
  Module,
  Runtime,
  RuntimeDependencies,
  RuntimeOptions,
  ModuleRegistry,
  RuntimeSignalTarget,
  RuntimeSignalHandlers,
} from "../src/index.js";

// ─── Harness ────────────────────────────────────────────

const quietLogger = new ConsoleLogger({ level: "fatal", structured: true });

interface ModuleSpec {
  readonly id: string;
  readonly dependencies?: readonly string[];
  readonly hooks?: Partial<
    Record<
      "initialize" | "start" | "stop" | "destroy",
      () => Promise<void> | void
    >
  >;
}

interface Harness {
  readonly registry: ModuleRegistry;
  readonly dependencies: RuntimeDependencies;
  readonly signalTarget: EventEmitter;
  readonly events: string[];
  create(options?: RuntimeOptions): Runtime;
}

async function createHarness(
  specs: readonly ModuleSpec[] = [],
  lifecycleOptions: {
    continueOnInitializeError?: boolean;
    continueOnStartError?: boolean;
    continueOnStopError?: boolean;
    continueOnDestroyError?: boolean;
  } = {},
): Promise<Harness> {
  const events: string[] = [];
  const registry = createModuleRegistry();
  const configuration = createConfigurationManager();
  await configuration.initialize();
  const application = new ApplicationContext({
    container: new Container(),
    configuration: configuration.getConfiguration(),
    modules: registry,
    logger: quietLogger,
  });
  const loader = createModuleLoader(registry, {
    application,
    configuration,
    logger: quietLogger,
  });
  const moduleLifecycle = createModuleLifecycleManager(
    registry,
    loader,
    lifecycleOptions,
  );

  for (const spec of specs) {
    const record =
      (phase: string, hook?: () => Promise<void> | void) => async () => {
        events.push(`${spec.id}:${phase}`);
        await hook?.();
      };
    const module: Module = {
      id: spec.id,
      name: spec.id,
      dependencies: spec.dependencies,
      onInitialize: record("initialize", spec.hooks?.initialize),
      onReady: record("start", spec.hooks?.start),
      onShutdown: record("stop", spec.hooks?.stop),
      onDestroy: record("destroy", spec.hooks?.destroy),
    };
    registry.register(
      defineModule({
        id: spec.id,
        name: spec.id,
        dependencies: spec.dependencies,
        factory: () => module,
      }),
    );
  }

  const signalTarget = new EventEmitter();
  const dependencies: RuntimeDependencies = {
    application,
    configuration,
    logger: quietLogger,
    moduleRegistry: registry,
    moduleLoader: loader,
    moduleLifecycle,
    signalTarget: signalTarget as unknown as RuntimeSignalTarget,
  };

  return {
    registry,
    dependencies,
    signalTarget,
    events,
    create: (options = {}) =>
      createRuntime(dependencies, {
        name: "test-runtime",
        mode: "test",
        ...options,
      }),
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

// ─── State table ────────────────────────────────────────

describe("runtime state table", () => {
  it("allows FAILED from every non-terminal state and forbids self transitions", () => {
    for (const from of [
      RuntimeState.CREATED,
      RuntimeState.BOOTSTRAPPING,
      RuntimeState.READY,
      RuntimeState.STOPPING,
    ]) {
      expect(canTransitionRuntime(from, RuntimeState.FAILED)).toBe(true);
      expect(canTransitionRuntime(from, from)).toBe(false);
    }
    expect(canTransitionRuntime(RuntimeState.FAILED, RuntimeState.FAILED)).toBe(
      false,
    );
    expect(
      canTransitionRuntime(RuntimeState.STOPPED, RuntimeState.STOPPED),
    ).toBe(false);
    expect(
      canTransitionRuntime(RuntimeState.CREATED, RuntimeState.STOPPED),
    ).toBe(true);
    expect(getNextRuntimeStates(RuntimeState.READY)).toEqual([
      RuntimeState.STOPPING,
      RuntimeState.FAILED,
    ]);
    expect(isRuntimeTerminal(RuntimeState.FAILED)).toBe(true);
    expect(canStopRuntime(RuntimeState.CREATED)).toBe(true);
  });

  it("throws InvalidRuntimeTransitionError for invalid transitions", () => {
    expect(() =>
      assertRuntimeTransition(RuntimeState.STOPPED, RuntimeState.READY),
    ).toThrow(InvalidRuntimeTransitionError);
    try {
      assertRuntimeTransition(RuntimeState.READY, RuntimeState.CREATED);
    } catch (error) {
      expect(error).toBeInstanceOf(RuntimeError);
      expect(isRuntimeError(error)).toBe(true);
      expect((error as InvalidRuntimeTransitionError).from).toBe("ready");
      expect((error as InvalidRuntimeTransitionError).to).toBe("created");
    }
  });
});

// ─── DefaultRuntime ─────────────────────────────────────

describe("DefaultRuntime", () => {
  it("loads, initializes, starts, stops and destroys modules in dependency order", async () => {
    const harness = await createHarness([
      { id: "db" },
      { id: "users", dependencies: ["db"] },
    ]);
    const runtime = harness.create();

    expect(runtime.state).toBe(RuntimeState.CREATED);
    await runtime.start();

    expect(runtime.state).toBe(RuntimeState.READY);
    expect(runtime.ready).toBe(true);
    expect(harness.events).toEqual([
      "db:initialize",
      "users:initialize",
      "db:start",
      "users:start",
    ]);
    expect(runtime.getModule("users")?.id).toBe("users");
    expect(runtime.requireModule("db").id).toBe("db");
    expect(() => runtime.requireModule("missing")).toThrow(ModuleNotFoundError);

    const bootstrap = runtime.getStatus().bootstrap!;
    expect(bootstrap.success).toBe(true);
    expect(bootstrap.loadedModules).toBe(2);
    expect(bootstrap.initializedModules).toBe(2);
    expect(bootstrap.startedModules).toBe(2);
    expect(bootstrap.errors).toEqual([]);

    await runtime.stop();

    expect(runtime.state).toBe(RuntimeState.STOPPED);
    expect(harness.events.slice(4)).toEqual([
      "users:stop",
      "db:stop",
      "users:destroy",
      "db:destroy",
    ]);

    const shutdown = runtime.getStatus().shutdown!;
    expect(shutdown.success).toBe(true);
    expect(shutdown.stoppedModules).toBe(2);
    expect(shutdown.destroyedModules).toBe(2);
    expect(shutdown.durationMs).toBeGreaterThanOrEqual(0);
    expect(runtime.getStatus().stoppedAt).toBeInstanceOf(Date);
  });

  it("exposes identity, context, environment and options", async () => {
    const harness = await createHarness();
    const runtime = harness.create({
      role: "worker",
      metadata: { region: "eu" },
      environment: { variables: { FOO: "bar" }, isCI: true },
    });

    expect(runtime.identity.name).toBe("test-runtime");
    expect(runtime.identity.id).toMatch(/^test-runtime-[0-9a-f-]{36}$/);
    expect(runtime.options.role).toBe("worker");
    expect(runtime.context.metadata.region).toBe("eu");
    expect(runtime.context.metadata.runtimeId).toBe(runtime.identity.id);
    expect(runtime.context.executionId).toBe(runtime.identity.id);
    expect(runtime.environment.get("FOO")).toBe("bar");
    expect(runtime.environment.isCI()).toBe(true);
    expect(runtime.getUptime()).toBeGreaterThanOrEqual(0);
    expect(runtime.getStateSnapshot().state).toBe(RuntimeState.CREATED);
    expect(runtime.getApplicationContext()).toBe(
      harness.dependencies.application,
    );
    expect(runtime.getConfiguration()).toBe(harness.dependencies.configuration);
    expect(runtime.getLogger()).toBe(quietLogger);
    expect(runtime.getModuleRegistry()).toBe(harness.registry);
    expect(runtime.getModuleLoader()).toBe(harness.dependencies.moduleLoader);
    expect(runtime.getModuleLifecycle()).toBe(
      harness.dependencies.moduleLifecycle,
    );
  });

  it("shares concurrent start() calls and soft-stops from CREATED", async () => {
    const harness = await createHarness([{ id: "a" }]);
    const runtime = harness.create();

    await Promise.all([runtime.start(), runtime.start()]);
    expect(harness.events.filter((e) => e === "a:start")).toHaveLength(1);
    await runtime.stop();

    const fresh = harness.create();
    await fresh.stop();
    expect(fresh.state).toBe(RuntimeState.STOPPED);
    expect(harness.events.filter((e) => e === "a:stop")).toHaveLength(1);
    await expect(fresh.start()).rejects.toThrow(InvalidRuntimeStateError);
  });

  it("fails on module initialization error, rolls back, and reports the error", async () => {
    const harness = await createHarness([
      { id: "ok" },
      {
        id: "broken",
        hooks: {
          initialize: () => {
            throw new Error("init boom");
          },
        },
      },
    ]);
    const runtime = harness.create();

    const error = await runtime.start().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RuntimeInitializationError);
    expect(isRuntimeError(error)).toBe(true);
    expect(errorsIsRuntimeError(error)).toBe(true);
    expect(error).toBeInstanceOf(ErrorsRuntimeError);
    expect(
      hasRuntimeErrorCode(error, RuntimeErrorCode.MODULE_INITIALIZATION_FAILED),
    ).toBe(true);
    expect((error as RuntimeError).runtimeName).toBe("test-runtime");
    expect((error as RuntimeError).phase).toBe("initializing");
    expect((error as Error).cause).toBeInstanceOf(Error);
    expect(((error as Error).cause as Error).message).toContain("init boom");

    expect(runtime.state).toBe(RuntimeState.FAILED);
    expect(runtime.failed).toBe(true);
    expect(runtime.getStatus().error).toBe(error);
    expect(runtime.getStatus().failedAt).toBeInstanceOf(Date);

    const bootstrap = runtime.getStatus().bootstrap!;
    expect(bootstrap.success).toBe(false);
    expect(bootstrap.phase).toBe("failed");
    expect(bootstrap.errors).toHaveLength(1);
    expect(bootstrap.errors[0]!.error).toBe(error);

    await expect(runtime.start()).rejects.toThrow(InvalidRuntimeStateError);
    await runtime.stop();
    expect(runtime.state).toBe(RuntimeState.FAILED);
  });

  it("wraps loader failures in RuntimeLoadError with the bare cause", async () => {
    const harness = await createHarness();
    const cause = new Error("cannot load");
    const runtime = harness.create();
    vi.spyOn(harness.dependencies.moduleLoader, "loadAll").mockRejectedValue(
      cause,
    );

    const error = await runtime.start().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RuntimeLoadError);
    expect((error as Error).cause).toBe(cause);
  });

  it("becomes READY with success:false and module errors when continueOnStartError is on", async () => {
    const harness = await createHarness(
      [
        { id: "good" },
        {
          id: "bad",
          hooks: {
            start: () => {
              throw new Error("start boom");
            },
          },
        },
      ],
      { continueOnStartError: true },
    );
    const runtime = harness.create({
      startup: { continueOnStartError: true },
    });

    await runtime.start();

    expect(runtime.state).toBe(RuntimeState.READY);
    const bootstrap = runtime.getStatus().bootstrap!;
    expect(bootstrap.success).toBe(false);
    expect(bootstrap.startedModules).toBe(1);
    expect(bootstrap.errors).toHaveLength(1);
    expect(bootstrap.errors[0]!.moduleName).toBe("bad");
    expect(bootstrap.errors[0]!.phase).toBe("starting");
    expect((bootstrap.errors[0]!.error as Error).message).toContain(
      "start boom",
    );
  });

  it("throws when the runtime flag is off even if the module manager is permissive", async () => {
    const harness = await createHarness(
      [
        {
          id: "bad",
          hooks: {
            start: () => {
              throw new Error("start boom");
            },
          },
        },
      ],
      { continueOnStartError: true },
    );
    const runtime = harness.create();

    const error = await runtime.start().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RuntimeStartError);
    expect(
      hasRuntimeErrorCode(error, RuntimeErrorCode.MODULE_START_FAILED),
    ).toBe(true);
    expect(runtime.state).toBe(RuntimeState.FAILED);
    // The failure was recorded once per module plus once for the throw.
    expect(
      runtime.getStatus().bootstrap!.errors.map((e) => e.moduleName),
    ).toEqual(["bad", undefined]);
  });

  it("reports shutdown errors and counts with continueOnStopError", async () => {
    const harness = await createHarness(
      [
        { id: "a" },
        {
          id: "b",
          hooks: {
            stop: () => {
              throw new Error("stop boom");
            },
          },
        },
      ],
      { continueOnStopError: true },
    );
    const runtime = harness.create();
    await runtime.start();
    await runtime.stop();

    expect(runtime.state).toBe(RuntimeState.STOPPED);
    const shutdown = runtime.getStatus().shutdown!;
    expect(shutdown.success).toBe(false);
    expect(shutdown.stoppedModules).toBe(1);
    expect(shutdown.destroyedModules).toBe(2);
    expect(shutdown.errors).toHaveLength(1);
    expect(shutdown.errors[0]!.moduleName).toBe("b");
    expect((shutdown.errors[0]!.error as Error).message).toContain("stop boom");
  });

  it("fails on shutdown errors when continueOnStopError is off", async () => {
    const harness = await createHarness(
      [
        {
          id: "b",
          hooks: {
            stop: () => {
              throw new Error("stop boom");
            },
          },
        },
      ],
      { continueOnStopError: true },
    );
    const runtime = harness.create({
      shutdown: { continueOnStopError: false },
    });
    await runtime.start();

    const error = await runtime.stop().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RuntimeStopError);
    expect(
      hasRuntimeErrorCode(error, RuntimeErrorCode.MODULE_STOP_FAILED),
    ).toBe(true);
    expect(runtime.state).toBe(RuntimeState.FAILED);
    expect(runtime.getStatus().shutdown!.success).toBe(false);
  });

  it("fail() marks the runtime failed from CREATED and READY", async () => {
    const harness = await createHarness([{ id: "a" }]);

    const created = harness.create();
    created.fail(new Error("early"));
    expect(created.state).toBe(RuntimeState.FAILED);
    expect((created.getStatus().error as Error).message).toBe("early");

    const ready = harness.create();
    await ready.start();
    ready.fail(new Error("late"));
    expect(ready.state).toBe(RuntimeState.FAILED);
    expect(ready.signalHandlersRegistered).toBe(false);

    await ready.stop();
    expect(harness.events).toContain("a:stop");
    expect(ready.state).toBe(RuntimeState.FAILED);
    ready.fail(new Error("again"));
    expect((ready.getStatus().error as Error).message).toBe("late");
  });

  it("honours fail() called while bootstrapping and while stopping", async () => {
    let releaseInit!: () => void;
    const initGate = new Promise<void>((resolve) => {
      releaseInit = resolve;
    });
    const harness = await createHarness([
      { id: "a", hooks: { initialize: () => initGate } },
    ]);

    const runtime = harness.create();
    const starting = runtime.start().catch((e: unknown) => e);
    await flush();
    expect(runtime.state).toBe(RuntimeState.BOOTSTRAPPING);
    runtime.fail(new Error("external"));
    expect(runtime.state).toBe(RuntimeState.FAILED);
    releaseInit();

    const error = await starting;
    expect(error).toBeInstanceOf(InvalidRuntimeStateError);
    expect((runtime.getStatus().error as Error).message).toBe("external");
    expect(harness.events).toContain("a:destroy");

    let releaseStop!: () => void;
    const stopGate = new Promise<void>((resolve) => {
      releaseStop = resolve;
    });
    const second = await createHarness([
      { id: "b", hooks: { stop: () => stopGate } },
    ]);
    const stopping = second.create();
    await stopping.start();
    const stopPromise = stopping.stop();
    await flush();
    expect(stopping.state).toBe(RuntimeState.STOPPING);
    stopping.fail(new Error("mid-stop"));
    releaseStop();
    await stopPromise;

    expect(stopping.state).toBe(RuntimeState.FAILED);
    expect(second.events).toContain("b:destroy");
  });

  it("times out bootstrap with a RuntimeTimeoutError and stays FAILED afterwards", async () => {
    vi.useFakeTimers();
    try {
      let release!: () => void;
      const harness = await createHarness([
        {
          id: "slow",
          hooks: {
            initialize: () =>
              new Promise<void>((resolve) => {
                release = resolve;
              }),
          },
        },
      ]);
      const runtime = harness.create({ startup: { timeoutMs: 50 } });
      const pending = runtime.start().catch((e: unknown) => e);

      await vi.advanceTimersByTimeAsync(60);
      const error = await pending;

      expect(error).toBeInstanceOf(RuntimeTimeoutError);
      expect(
        hasRuntimeErrorCode(error, RuntimeErrorCode.BOOTSTRAP_TIMEOUT),
      ).toBe(true);
      expect((error as RuntimeTimeoutError).timeoutMs).toBe(50);
      expect(runtime.state).toBe(RuntimeState.FAILED);
      expect(runtime.getStatus().bootstrap!.phase).toBe("failed");

      // Letting the abandoned pipeline finish must not mutate state.
      release();
      await vi.runAllTimersAsync();
      expect(runtime.state).toBe(RuntimeState.FAILED);
      expect(runtime.getStatus().bootstrap!.phase).toBe("failed");
    } finally {
      vi.useRealTimers();
    }
  });

  it("registers signal handlers on start and removes them on stop", async () => {
    const harness = await createHarness([{ id: "a" }]);
    const runtime = harness.create();

    expect(harness.signalTarget.listenerCount("SIGINT")).toBe(0);
    await runtime.start();
    expect(harness.signalTarget.listenerCount("SIGINT")).toBe(1);
    expect(harness.signalTarget.listenerCount("SIGTERM")).toBe(1);
    expect(harness.signalTarget.listenerCount("SIGHUP")).toBe(0);
    expect(harness.signalTarget.listenerCount("uncaughtException")).toBe(1);
    expect(runtime.signalHandlersRegistered).toBe(true);

    await runtime.stop();
    expect(harness.signalTarget.listenerCount("SIGINT")).toBe(0);
    expect(harness.signalTarget.listenerCount("uncaughtException")).toBe(0);
    expect(runtime.signalHandlersRegistered).toBe(false);
  });

  it("stops gracefully on SIGINT without exiting the process", async () => {
    const harness = await createHarness([{ id: "a" }]);
    const exit = vi.fn();
    (harness.signalTarget as unknown as { exit: unknown }).exit = exit;
    const runtime = harness.create();
    await runtime.start();

    harness.signalTarget.emit("SIGINT");
    harness.signalTarget.emit("SIGINT");
    await vi.waitFor(() => expect(runtime.state).toBe(RuntimeState.STOPPED));

    expect(exit).not.toHaveBeenCalled();
    expect(harness.events).toContain("a:destroy");
  });

  it("marks the runtime failed and unwinds on uncaughtException", async () => {
    const harness = await createHarness([{ id: "a" }]);
    const runtime = harness.create();
    await runtime.start();

    harness.signalTarget.emit("uncaughtException", new Error("crash"));
    await vi.waitFor(() => expect(harness.events).toContain("a:destroy"));

    expect(runtime.state).toBe(RuntimeState.FAILED);
    expect((runtime.getStatus().error as Error).message).toBe("crash");
    expect(harness.signalTarget.listenerCount("SIGINT")).toBe(0);
  });

  it("does not register handlers that are disabled", async () => {
    const harness = await createHarness();
    const runtime = harness.create({
      signals: {
        handleSigint: false,
        handleSigterm: false,
        handleUncaughtException: false,
        handleUnhandledRejection: false,
      },
    });
    await runtime.start();
    expect(harness.signalTarget.eventNames()).toEqual([]);
    expect(runtime.signalHandlersRegistered).toBe(false);
    await runtime.dispose();
    expect(runtime.state).toBe(RuntimeState.STOPPED);
  });

  it("is a DefaultRuntime instance created by createRuntime", async () => {
    const harness = await createHarness();
    expect(harness.create()).toBeInstanceOf(DefaultRuntime);
  });
});

// ─── Signal manager ─────────────────────────────────────

describe("RuntimeSignalManager", () => {
  function createManager(overrides: Partial<RuntimeOptions["signals"]> = {}) {
    const target = new EventEmitter() as EventEmitter & { exit: unknown };
    const exit = vi.fn();
    target.exit = exit;
    const manager = new RuntimeSignalManager({
      signals: resolveRuntimeOptions({ signals: overrides }).signals,
      target: target as unknown as RuntimeSignalTarget,
    });
    const handlers: RuntimeSignalHandlers = {
      onSignal: vi.fn(),
      onUncaughtException: vi.fn(),
      onUnhandledRejection: vi.fn(),
    };
    return { target, exit, manager, handlers };
  }

  it("ignores a second signal by default and never exits", async () => {
    const { target, exit, manager, handlers } = createManager();
    manager.register(handlers);
    manager.register(handlers);

    target.emit("SIGTERM");
    target.emit("SIGINT");
    await flush();

    expect(handlers.onSignal).toHaveBeenCalledTimes(1);
    expect(handlers.onSignal).toHaveBeenCalledWith("SIGTERM");
    expect(manager.receivedSignals).toBe(2);
    expect(exit).not.toHaveBeenCalled();

    manager.unregister();
    expect(manager.registered).toBe(false);
    expect(target.listenerCount("SIGTERM")).toBe(0);
  });

  it("force-exits on the second signal only when explicitly enabled", () => {
    const { target, exit, manager, handlers } = createManager({
      forceExitOnSecondSignal: true,
      forceExitCode: 130,
    });
    manager.register(handlers);

    target.emit("SIGINT");
    expect(exit).not.toHaveBeenCalled();
    target.emit("SIGINT");
    expect(exit).toHaveBeenCalledWith(130);
  });

  it("forwards uncaughtException and unhandledRejection", async () => {
    const { target, manager, handlers } = createManager();
    manager.register(handlers);
    const error = new Error("x");

    target.emit("uncaughtException", error);
    target.emit("unhandledRejection", "reason");
    await flush();

    expect(handlers.onUncaughtException).toHaveBeenCalledWith(error);
    expect(handlers.onUnhandledRejection).toHaveBeenCalledWith("reason");
  });

  it("swallows handler failures so a crashing handler cannot crash the process", async () => {
    const { target, manager } = createManager();
    manager.register({
      onSignal: () => Promise.reject(new Error("handler failed")),
      onUncaughtException: () => {
        throw new Error("sync failure");
      },
      onUnhandledRejection: () => {},
    });

    expect(() => target.emit("SIGINT")).not.toThrow();
    expect(() => target.emit("uncaughtException", new Error())).not.toThrow();
    await flush();
  });
});

// ─── Timeout helper ─────────────────────────────────────

describe("withRuntimeTimeout", () => {
  it("aborts the signal and attaches a handler to the abandoned promise", async () => {
    vi.useFakeTimers();
    try {
      let seen: AbortSignal | undefined;
      let rejectLate!: (error: Error) => void;
      const late = vi.fn();
      const pending = withRuntimeTimeout(
        (signal) => {
          seen = signal;
          return new Promise<void>((_resolve, reject) => {
            rejectLate = reject;
          });
        },
        10,
        { onLateRejection: late },
      ).catch((e: unknown) => e);

      await vi.advanceTimersByTimeAsync(20);
      const error = await pending;

      expect(error).toBeInstanceOf(RuntimeTimeoutError);
      expect(seen?.aborted).toBe(true);

      rejectLate(new Error("late failure"));
      await vi.runAllTimersAsync();
      expect(late).toHaveBeenCalledWith(expect.any(Error));
    } finally {
      vi.useRealTimers();
    }
  });

  it("passes results through when the operation completes in time", async () => {
    await expect(withRuntimeTimeout(async () => 42, 1_000)).resolves.toBe(42);
    await expect(withRuntimeTimeout(async () => "no-timeout", 0)).resolves.toBe(
      "no-timeout",
    );
  });
});

// ─── Environment ────────────────────────────────────────

describe("runtime environment", () => {
  it("never serializes environment variables", () => {
    const environment = createRuntimeEnvironment({
      mode: "production",
      role: "api",
      variables: { DATABASE_URL: "postgres://secret", CI: "true" },
    });

    const json = JSON.parse(JSON.stringify(environment)) as Record<
      string,
      unknown
    >;
    expect(json).not.toHaveProperty("variables");
    expect(JSON.stringify(environment)).not.toContain("secret");
    expect(environment.toJSON()).not.toHaveProperty("variables");
    expect(json.mode).toBe("production");
    expect(json.isCI).toBe(true);
    expect(environment.get("DATABASE_URL")).toBe("postgres://secret");
    expect(environment.has("MISSING")).toBe(false);
  });

  it("throws MissingEnvironmentVariableError from require()", () => {
    const environment = createRuntimeEnvironment({
      mode: "test",
      role: "cli",
      variables: { EMPTY: "" },
    });

    expect(() => environment.require("EMPTY")).toThrow(
      MissingEnvironmentVariableError,
    );
    try {
      environment.require("NOPE");
    } catch (error) {
      expect(isRuntimeError(error)).toBe(true);
      expect((error as MissingEnvironmentVariableError).variableName).toBe(
        "NOPE",
      );
    }
  });

  it("detects container state from the injected snapshot only", () => {
    const previous = process.env.container;
    process.env.container = "podman";
    try {
      expect(detectContainer({})).toBe(false);
      expect(detectContainer({ container: "podman" })).toBe(true);
      expect(detectContainer({ KUBERNETES_SERVICE_HOST: "10.0.0.1" })).toBe(
        true,
      );
      expect(
        createRuntimeEnvironment({
          mode: "test",
          role: "cli",
          variables: {},
          isContainer: false,
        }).isContainer(),
      ).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.container;
      else process.env.container = previous;
    }
  });

  it("reads hostname and cpu count through node:os", () => {
    const host = detectHostInfo(detectPlatform());
    expect(typeof host.hostname).toBe("string");
    expect(host.cpuCount).toBeGreaterThan(0);
  });
});

// ─── Context and options ────────────────────────────────

describe("runtime context and options", () => {
  it("creates UUID-based runtime ids", () => {
    const id = createRuntimeId("My Service!");
    expect(id).toMatch(
      /^my-service-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(createRuntimeId("")).toMatch(/^runtime-/);
    expect(createRuntimeId("a")).not.toBe(createRuntimeId("a"));
  });

  it("builds an immutable ExecutionContext from the identity", () => {
    const identity = createRuntimeIdentity({
      name: "ctx",
      mode: "test",
      role: "application",
    });
    const context = createRuntimeExecutionContext(identity, {
      key: "value",
      runtimeId: "cannot-override",
    });

    expect(context.executionId).toBe(identity.id);
    expect(context.service).toBe("ctx");
    expect(context.transport).toBe("runtime");
    expect(context.operation).toBe("runtime");
    expect(context.startedAt).toBe(identity.createdAt);
    expect(context.metadata.key).toBe("value");
    expect(context.metadata.runtimeId).toBe(identity.id);
    expect(context.metadata.runtimeName).toBe("ctx");
    expect(context.metadata.runtimeMode).toBe("test");
    expect(context.metadata.runtimeRole).toBe("application");
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.metadata)).toBe(true);
    /* The deprecated factory name is the canonical function. */
    expect(createRuntimeContext).toBe(createRuntimeExecutionContext);
  });

  it("tracks timing on the runtime through state changes", async () => {
    const harness = await createHarness([{ id: "a" }]);
    const runtime = harness.create();

    expect(runtime.timing.createdAt).toBe(runtime.identity.createdAt);
    expect(runtime.timing.startupStartedAt).toBeUndefined();

    await runtime.start();
    expect(runtime.timing.startupStartedAt).toBeInstanceOf(Date);
    expect(runtime.timing.readyAt).toBeInstanceOf(Date);
    expect(runtime.getStatus().startedAt).toBe(runtime.timing.readyAt);
    expect(runtime.getStatus().timing).toBe(runtime.timing);

    await runtime.stop();
    expect(runtime.timing.shutdownStartedAt).toBeInstanceOf(Date);
    expect(runtime.timing.stoppedAt).toBeInstanceOf(Date);
    expect(runtime.getStatus().stoppedAt).toBe(runtime.timing.stoppedAt);
    expect(runtime.timing.failedAt).toBeUndefined();
    expect(Object.isFrozen(runtime.timing)).toBe(true);
  });

  it("resolves defaults and new signal options", () => {
    const resolved = resolveRuntimeOptions();
    expect(resolved.signals.forceExitOnSecondSignal).toBe(false);
    expect(resolved.signals.forceExitCode).toBe(1);
    expect(resolved.environment).toEqual({});
    expect(resolved.startup).toEqual(DEFAULT_RUNTIME_OPTIONS.startup);
    expect(() => resolveRuntimeOptions({ startup: { timeoutMs: -1 } })).toThrow(
      TypeError,
    );
  });
});

// ─── Errors ─────────────────────────────────────────────

describe("runtime errors", () => {
  it("wraps unknown values with toRuntimeError and keeps the bare cause", () => {
    const cause = new Error("root");
    const wrapped = toRuntimeError(cause, { operation: "start" });
    expect(wrapped.cause).toBe(cause);
    expect(wrapped.getCause()).toBe(cause);
    expect(wrapped.operation).toBe("start");
    expect(toRuntimeError(wrapped)).toBe(wrapped);
    expect(toRuntimeError("text").message).toBe("text");
  });

  it("serializes with the core runtime fields", () => {
    const error = new RuntimeStartError("boom", {
      runtimeId: "r1",
      runtimeName: "svc",
      moduleName: "users",
      phase: "starting",
      metadata: { attempt: 2 },
      recoverable: true,
    });
    const json = error.toJSON();

    expect(json.name).toBe("RuntimeStartError");
    expect(json.code).toBe(RuntimeErrorCode.BOOTSTRAP_FAILED);
    expect(json.operation).toBe("start");
    expect(json.phase).toBe("starting");
    expect(json.runtimeId).toBe("r1");
    expect(json.moduleName).toBe("users");
    expect(json.errorMetadata).toEqual({ attempt: 2 });
    expect(json.recoverable).toBe(true);
    expect(error.metadata.runtimeName).toBe("svc");
    expect(error.component).toBe("users");
  });
});
