/**
 * Round 12 regression tests for @zudojs/core.
 *
 * One describe block per academy finding; each test reproduced the
 * finding against the source before the fix was written.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { EventEmitter } from "node:events";

import {
  Application,
  ConsoleLogger,
  ContextValueNotFoundError,
  CoreLifecycleState,
  CoreLifecycleManager,
  CoreLifecycle,
  CoreContainer,
  CoreConfigurationManager,
  createCoreRuntime,
  Container,
  ConfigurationManager,
  createApplication,
  createContextKey,
  createContextValues,
  createModuleLifecycleManager,
  createModuleRegistry,
  createRuntime,
  defineModule,
  FrameworkError,
  Lifecycle,
  LifecycleManager,
  LifecycleState,
  MissingModuleDependencyError,
} from "../src/index.js";
import type {
  Logger,
  LogContext,
  Module,
  ModuleLoader,
  RuntimeSignalTarget,
} from "../src/index.js";

const quiet = {
  signals: {
    handleSigint: false,
    handleSigterm: false,
    handleUncaughtException: false,
    handleUnhandledRejection: false,
  },
  diagnostics: { startupLogging: false, shutdownLogging: false },
};

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

type Hooks = Partial<Pick<Module, "onInitialize" | "onReady" | "onShutdown" | "onDestroy">>;

function moduleDef(id: string, hooks: Hooks, dependencies: readonly string[] = []) {
  return defineModule({
    id,
    name: id,
    dependencies,
    factory: () => ({ id, name: id, ...hooks }) as Module,
  });
}

interface CapturedLog {
  readonly level: string;
  readonly message: string;
  readonly context?: LogContext;
}

function capturingLogger(): { logger: Logger; entries: CapturedLog[] } {
  const entries: CapturedLog[] = [];
  const push =
    (level: string) =>
    (message: string, a?: unknown, b?: unknown): void => {
      const context = (level === "error" || level === "fatal" ? b : a) as
        | LogContext
        | undefined;
      entries.push({ level, message, context });
    };
  const logger: Logger = {
    trace: push("trace"),
    debug: push("debug"),
    info: push("info"),
    warn: push("warn"),
    error: push("error"),
    fatal: push("fatal"),
    child: () => logger,
  };
  return { logger, entries };
}

function captureConsole(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const spies = (["debug", "info", "warn", "error", "log"] as const).map(
    (method) =>
      vi.spyOn(console, method).mockImplementation((message: unknown) => {
        lines.push(String(message));
      }),
  );
  return {
    lines,
    restore: () => {
      for (const spy of spies) spy.mockRestore();
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("#20/#68 rollback never destroys a module that never initialized", () => {
  it("destroys only touched modules, in reverse dependency order", async () => {
    const log: string[] = [];
    const hooks = (id: string, failInit = false): Hooks => ({
      onInitialize: () => {
        log.push(`${id}.init`);
        if (failInit) throw new Error(`${id} down`);
      },
      onShutdown: () => void log.push(`${id}.stop`),
      onDestroy: () => void log.push(`${id}.destroy`),
    });

    const app = await createApplication({
      modules: [
        moduleDef("catalog", hooks("catalog")),
        moduleDef("database", hooks("database", true), ["catalog"]),
        moduleDef("http", hooks("http"), ["database"]),
      ],
      runtime: quiet,
    });

    await expect(app.start()).rejects.toThrow();
    await app.stop();
    await delay(20);

    expect(log).toEqual([
      "catalog.init",
      "database.init",
      "database.destroy",
      "catalog.destroy",
    ]);
  });

  it("a failed start() does not destroy or stop a module that was never reached", async () => {
    const log: string[] = [];
    const app = await createApplication({
      modules: [
        moduleDef("catalog", {
          onReady: () => {
            throw new Error("catalog cannot listen");
          },
          onShutdown: () => void log.push("catalog.stop"),
          onDestroy: () => void log.push("catalog.destroy"),
        }),
        moduleDef(
          "http",
          {
            onInitialize: () => void log.push("http.init"),
            onReady: () => void log.push("http.ready"),
            onShutdown: () => void log.push("http.stop"),
            onDestroy: () => void log.push("http.destroy"),
          },
          ["catalog"],
        ),
      ],
      runtime: quiet,
    });

    await expect(app.start()).rejects.toThrow();
    await app.stop();
    await delay(20);

    expect(log).toEqual(["http.init", "http.destroy", "catalog.destroy"]);
  });
});

describe("#21 a signal-triggered runtime stop is reflected by the Application", () => {
  it("moves the application to stopped and stops its participants", async () => {
    const target = new EventEmitter();
    const calls: string[] = [];

    const app = await createApplication({
      signalTarget: target,
      participants: [
        {
          name: "metrics",
          start: () => void calls.push("metrics.start"),
          stop: () => void calls.push("metrics.stop"),
        },
      ],
      modules: [
        moduleDef("db", { onShutdown: () => void calls.push("db.stop") }),
      ],
      runtime: {
        diagnostics: quiet.diagnostics,
        signals: { ...quiet.signals, handleSigterm: true },
      },
    });

    await app.start();
    expect(app.state).toBe("running");

    target.emit("SIGTERM");
    await delay(60);

    expect(app.applicationRuntime?.state).toBe("stopped");
    expect(app.state).toBe("stopped");
    expect(calls).toEqual(["metrics.start", "db.stop", "metrics.stop"]);
  });

  it("marks the application failed after a fatal error stopped the runtime", async () => {
    const target = Object.assign(new EventEmitter(), { exit: vi.fn() });
    const calls: string[] = [];

    const app = await createApplication({
      signalTarget: target,
      participants: [{ name: "p", stop: () => void calls.push("p.stop") }],
      runtime: {
        diagnostics: quiet.diagnostics,
        signals: {
          ...quiet.signals,
          handleUncaughtException: true,
          exitOnFatalError: false,
        },
      },
    });

    await app.start();
    target.emit("uncaughtException", new Error("boom"));
    await delay(60);

    expect(app.applicationRuntime?.state).toBe("failed");
    expect(app.state).toBe("failed");
    expect(calls).toEqual(["p.stop"]);
  });
});

describe("#22 RuntimeSignalTarget accepts process and EventEmitter", () => {
  it("compiles without a cast", async () => {
    const asProcess: RuntimeSignalTarget = process;
    const asEmitter: RuntimeSignalTarget = new EventEmitter();
    expect(typeof asProcess.on).toBe("function");
    expect(typeof asEmitter.on).toBe("function");

    const app = await createApplication({
      signalTarget: new EventEmitter(),
      runtime: quiet,
    });
    await app.start();
    await app.stop();
  });
});

describe("#23 a registered-but-unloaded dependency is described as such", () => {
  it("names the registration state instead of calling the module missing", async () => {
    const registry = createModuleRegistry();
    const loader = {
      getContext: () => ({}),
      unload: () => undefined,
    } as unknown as ModuleLoader;
    const lifecycle = createModuleLifecycleManager(registry, loader);

    registry.register(moduleDef("orders", {}, ["payments"]));
    registry.setState("orders", "loaded", {
      instance: { id: "orders", name: "orders" } as Module,
    });
    registry.register(moduleDef("payments", {}));

    let thrown: unknown;
    try {
      await lifecycle.initialize();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(MissingModuleDependencyError);
    expect((thrown as Error).message).toMatch(
      /"orders" depends on "payments", which is registered but not loaded \(state: "registered"\)/,
    );
    expect((thrown as Error).message).not.toMatch(/missing module/);
  });

  it("keeps the original wording for a dependency that is not registered at all", () => {
    expect(new MissingModuleDependencyError("orders", "payments").message).toBe(
      'Module "orders" requires missing module "payments".',
    );
  });
});

describe("#24 ConsoleLogger redacts sensitive keys by default", () => {
  it("redacts password/token/secret in context and error details", () => {
    const capture = captureConsole();
    const logger = new ConsoleLogger({ structured: true, timestamps: false });

    logger.info("login", {
      password: "hunter2",
      user: { apiToken: "t-1", name: "bob" },
    });

    const entry = JSON.parse(capture.lines.at(-1)!) as {
      context: Record<string, unknown>;
    };
    expect(entry.context.password).toBe("[REDACTED]");
    expect((entry.context.user as Record<string, unknown>).apiToken).toBe("[REDACTED]");
    expect((entry.context.user as Record<string, unknown>).name).toBe("bob");

    logger.error(
      "failed",
      Object.assign(new Error("x"), { details: { secret: "s" } }),
    );
    const errorEntry = JSON.parse(capture.lines.at(-1)!) as {
      error: { details: Record<string, unknown> };
    };
    expect(errorEntry.error.details.secret).toBe("[REDACTED]");
    capture.restore();
  });

  it("can be switched off explicitly with redact: false", () => {
    const capture = captureConsole();
    const logger = new ConsoleLogger({
      structured: true,
      timestamps: false,
      redact: false,
    });

    logger.info("login", { password: "hunter2" });

    const entry = JSON.parse(capture.lines.at(-1)!) as {
      context: Record<string, unknown>;
    };
    expect(entry.context.password).toBe("hunter2");
    capture.restore();
  });

  it("child loggers inherit the default redaction", () => {
    const capture = captureConsole();
    const logger = new ConsoleLogger({ structured: true, timestamps: false });

    logger.child({ requestId: "r-1" }).warn("token seen", { token: "abc" });

    const entry = JSON.parse(capture.lines.at(-1)!) as {
      context: Record<string, unknown>;
    };
    expect(entry.context.token).toBe("[REDACTED]");
    expect(entry.context.requestId).toBe("r-1");
    capture.restore();
  });
});

describe("#25 ContextValues.require throws a framework error", () => {
  it("throws ContextValueNotFoundError with a code and the key name", () => {
    const key = createContextKey<string>("tenant");

    let thrown: unknown;
    try {
      createContextValues().require(key);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ContextValueNotFoundError);
    expect(thrown).toBeInstanceOf(FrameworkError);
    expect((thrown as FrameworkError).code).toBe("CORE_CONTEXT_VALUE_NOT_FOUND");
    expect((thrown as Error).message).toContain('"tenant"');
    expect((thrown as FrameworkError).details).toEqual({ key: "tenant" });
  });
});

describe("#26 stop() after a startup timeout does not wait out the shutdown timeout", () => {
  it("returns promptly when the timed-out hook never settles", async () => {
    const app = await createApplication({
      modules: [
        moduleDef("db", {
          onInitialize: () => new Promise<void>(() => undefined),
        }),
      ],
      runtime: {
        ...quiet,
        startup: { timeoutMs: 40 },
        shutdown: { timeoutMs: 3_000 },
      },
    });

    await expect(app.start()).rejects.toThrow();

    const began = Date.now();
    await app.stop();

    expect(Date.now() - began).toBeLessThan(1_000);
    expect(app.applicationRuntime?.state).toBe("failed");
  });

  it("still destroys a module whose hook settles after stop() returned", async () => {
    const log: string[] = [];
    const app = await createApplication({
      modules: [
        moduleDef("db", {
          onInitialize: async () => {
            await delay(120);
            log.push("init:end");
          },
          onDestroy: () => void log.push("destroy"),
        }),
      ],
      runtime: { ...quiet, startup: { timeoutMs: 30 } },
    });

    await expect(app.start()).rejects.toThrow();
    await app.stop();
    expect(log).toEqual([]);

    await delay(200);
    expect(log).toEqual(["init:end", "destroy"]);
  });
});

describe("#27/#34 colliding export names have Core-prefixed aliases", () => {
  it("aliases are the same bindings as the originals", () => {
    expect(CoreLifecycleState).toBe(LifecycleState);
    expect(CoreLifecycleManager).toBe(LifecycleManager);
    expect(CoreLifecycle).toBe(Lifecycle);
    expect(CoreContainer).toBe(Container);
    expect(CoreConfigurationManager).toBe(ConfigurationManager);
    expect(createCoreRuntime).toBe(createRuntime);

    const state: CoreLifecycleState = CoreLifecycleState.RUNNING;
    expect(state).toBe("running");
  });
});

describe("#28 runtime diagnostics log the mode and a real phase", () => {
  it("environment is the runtime mode, engine is separate, and phase is never 'created'", async () => {
    const { logger, entries } = capturingLogger();
    const app = await createApplication({
      logger,
      modules: [moduleDef("db", {})],
      runtime: { signals: quiet.signals, mode: "test" },
    });

    await app.start();
    await app.stop();

    const started = entries.find((e) => e.message === "Runtime shutdown started.");
    const bootstrap = entries.find((e) => e.message === "Runtime bootstrap started.");
    expect(started).toBeDefined();
    expect(bootstrap).toBeDefined();

    for (const entry of [started!, bootstrap!]) {
      expect(entry.context?.environment).toBe("test");
      expect(entry.context?.engine).toBe("node");
      expect(entry.context?.phase).not.toBe("created");
    }
    expect(started!.context?.phase).toBe("stopping");
    expect(bootstrap!.context?.phase).toBe("loading");
  });
});

describe("#138 core Logger accepts the @zudojs/logger calling convention", () => {
  it("treats a plain object second argument as context when no third is given", () => {
    const capture = captureConsole();
    const logger = new ConsoleLogger({ structured: true, timestamps: false });

    logger.error("order failed", { orderId: "o-1" });
    const asContext = JSON.parse(capture.lines.at(-1)!) as Record<string, unknown>;
    expect((asContext.context as Record<string, unknown>).orderId).toBe("o-1");
    expect(asContext.error).toBeUndefined();

    logger.error("order failed", new Error("db down"));
    const asError = JSON.parse(capture.lines.at(-1)!) as {
      error: { message: string };
    };
    expect(asError.error.message).toBe("db down");

    logger.fatal("crash", { code: 7 }, { requestId: "r-1" });
    const explicit = JSON.parse(capture.lines.at(-1)!) as {
      error: { message: string };
      context: Record<string, unknown>;
    };
    expect(explicit.context.requestId).toBe("r-1");
    expect(explicit.error).toBeDefined();
    capture.restore();
  });
});

describe("Application.stop is single-flight", () => {
  it("a second stop() while stopping joins the first", async () => {
    let release: (() => void) | undefined;
    const app = await createApplication({
      modules: [
        moduleDef("db", {
          onShutdown: () =>
            new Promise<void>((resolve) => {
              release = resolve;
            }),
        }),
      ],
      runtime: quiet,
    });
    await app.start();

    const first = app.stop();
    expect(app.state).toBe("stopping");
    const second = app.stop();
    release?.();

    await Promise.all([first, second]);
    expect(app.state).toBe("stopped");
    expect(app).toBeInstanceOf(Application);
  });
});
