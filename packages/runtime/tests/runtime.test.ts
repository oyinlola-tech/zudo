/**
 * @zudojs/runtime — Tests
 *
 * Comprehensive tests for the runtime package.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import { createRuntime } from "../src/runtime/runtime.core.js";

import type { RuntimeDependencies } from "../src/runtime/runtime.core.js";

import type { RuntimeOptions } from "../src/runtimeOptions/runtimeOptions.type.js";

import type { Module } from "@zudojs/core";

import { createLogger } from "@zudojs/logger";

import { createContainer } from "@zudojs/container";

import { createEventBus } from "@zudojs/events";

import { RuntimeRegistry } from "../src/registry/index.js";

import {
  createTestRuntime,
  withTestRuntime,
} from "../src/testRuntime/index.js";

import {
  buildDependencyGraph,
  resolveDependencies,
} from "../src/dependencyGraph/index.js";

import { ReadinessTracker } from "../src/readiness/index.js";

import { SignalHandler } from "../src/signalHandler/index.js";

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function createMockModuleHelper(
  id: string,
  dependencies: string[] = [],
): Module {
  return {
    id,
    name: `Module ${id}`,
    dependencies,
    onInitialize: vi.fn().mockResolvedValue(undefined),
    onReady: vi.fn().mockResolvedValue(undefined),
    onShutdown: vi.fn().mockResolvedValue(undefined),
    onDestroy: vi.fn().mockResolvedValue(undefined),
  };
}

function createTestDependencies(modules: Module[]): RuntimeDependencies {
  const logger = createLogger({ name: "test-runtime" });
  const container = createContainer();
  const eventBus = createEventBus();

  const moduleMap = new Map<string, Module>();
  for (const module of modules) {
    moduleMap.set(module.id, module);
  }

  return {
    modules: moduleMap,
    logger,
    container,
    eventBus,
  };
}

function createTestOptions(): RuntimeOptions {
  return {
    environment: "test",
    applicationName: "test-app",
    handleSignals: false,
    handleFatalErrors: false,
    shutdownTimeout: 5000,
    startupTimeout: 10000,
    emitEvents: false,
  };
}

/* ─── Runtime ─────────────────────────────────────────────────────────────── */

describe("Runtime", () => {
  describe("createRuntime", () => {
    it("creates a runtime instance", () => {
      const dependencies = createTestDependencies([]);
      const options = createTestOptions();
      const runtime = createRuntime(dependencies, options);

      expect(runtime.state).toBe("created");
      expect(runtime.ready).toBe(false);
    });
  });

  describe("start", () => {
    it("starts the runtime successfully", async () => {
      const module = createMockModuleHelper("test-module");
      const dependencies = createTestDependencies([module]);
      const options = createTestOptions();
      const runtime = createRuntime(dependencies, options);

      await runtime.start();

      expect(runtime.state).toBe("running");
      expect(runtime.ready).toBe(true);
      expect(module.onInitialize).toHaveBeenCalledOnce();
      expect(module.onReady).toHaveBeenCalledOnce();
    });

    it("starts modules in dependency order", async () => {
      const moduleA = createMockModuleHelper("module-a");
      const moduleB = createMockModuleHelper("module-b", ["module-a"]);
      const moduleC = createMockModuleHelper("module-c", ["module-b"]);

      const dependencies = createTestDependencies([moduleC, moduleA, moduleB]);
      const options = createTestOptions();
      const runtime = createRuntime(dependencies, options);

      await runtime.start();

      expect(moduleA.onInitialize).toHaveBeenCalledBefore(
        moduleB.onInitialize as ReturnType<typeof vi.fn>,
      );
      expect(moduleB.onInitialize).toHaveBeenCalledBefore(
        moduleC.onInitialize as ReturnType<typeof vi.fn>,
      );
    });

    it("does not start twice", async () => {
      const module = createMockModuleHelper("test-module");
      const dependencies = createTestDependencies([module]);
      const options = createTestOptions();
      const runtime = createRuntime(dependencies, options);

      await runtime.start();
      await runtime.start();

      expect(module.onInitialize).toHaveBeenCalledOnce();
    });

    it("handles startup failure with rollback", async () => {
      const moduleA = createMockModuleHelper("module-a");
      const moduleB = createMockModuleHelper("module-b");
      moduleB.onInitialize = vi
        .fn()
        .mockRejectedValue(new Error("Init failed"));

      const dependencies = createTestDependencies([moduleA, moduleB]);
      const options = createTestOptions();
      const runtime = createRuntime(dependencies, options);

      await expect(runtime.start()).rejects.toThrow();
      expect(runtime.state).toBe("failed");
    });
  });

  describe("stop", () => {
    it("stops the runtime successfully", async () => {
      const module = createMockModuleHelper("test-module");
      const dependencies = createTestDependencies([module]);
      const options = createTestOptions();
      const runtime = createRuntime(dependencies, options);

      await runtime.start();
      await runtime.stop();

      expect(runtime.state).toBe("stopped");
      expect(runtime.ready).toBe(false);
      expect(module.onShutdown).toHaveBeenCalledOnce();
      expect(module.onDestroy).toHaveBeenCalledOnce();
    });

    it("stops modules in reverse dependency order", async () => {
      const moduleA = createMockModuleHelper("module-a");
      const moduleB = createMockModuleHelper("module-b", ["module-a"]);
      const moduleC = createMockModuleHelper("module-c", ["module-b"]);

      const dependencies = createTestDependencies([moduleC, moduleA, moduleB]);
      const options = createTestOptions();
      const runtime = createRuntime(dependencies, options);

      await runtime.start();
      await runtime.stop();

      expect(moduleC.onShutdown).toHaveBeenCalledBefore(
        moduleB.onShutdown as ReturnType<typeof vi.fn>,
      );
      expect(moduleB.onShutdown).toHaveBeenCalledBefore(
        moduleA.onShutdown as ReturnType<typeof vi.fn>,
      );
    });

    it("handles stop without start", async () => {
      const module = createMockModuleHelper("test-module");
      const dependencies = createTestDependencies([module]);
      const options = createTestOptions();
      const runtime = createRuntime(dependencies, options);

      await runtime.stop();

      expect(runtime.state).toBe("stopped");
    });

    it("idempotent stop", async () => {
      const module = createMockModuleHelper("test-module");
      const dependencies = createTestDependencies([module]);
      const options = createTestOptions();
      const runtime = createRuntime(dependencies, options);

      await runtime.start();
      await runtime.stop();
      await runtime.stop();

      expect(module.onShutdown).toHaveBeenCalledOnce();
    });
  });

  describe("status", () => {
    it("returns status snapshot", () => {
      const dependencies = createTestDependencies([]);
      const options = createTestOptions();
      const runtime = createRuntime(dependencies, options);
      const status = runtime.status;

      expect(status.state).toBe("created");
      expect(status.ready).toBe(false);
      expect(status.running).toBe(false);
    });
  });
});

/* ─── Runtime Registry ────────────────────────────────────────────────────── */

describe("RuntimeRegistry", () => {
  let registry: RuntimeRegistry;

  beforeEach(() => {
    registry = new RuntimeRegistry();
  });

  it("registers and retrieves runtimes", () => {
    const runtime = createTestRuntime([]);
    registry.register("api", runtime);

    expect(registry.has("api")).toBe(true);
    expect(registry.get("api")).toBe(runtime);
  });

  it("throws on duplicate registration", () => {
    const runtime = createTestRuntime([]);
    registry.register("api", runtime);

    expect(() => registry.register("api", runtime)).toThrow(
      "already registered",
    );
  });

  it("require throws for missing runtime", () => {
    expect(() => registry.require("missing")).toThrow("not found");
  });

  it("unregisters runtimes", () => {
    const runtime = createTestRuntime([]);
    registry.register("api", runtime);
    registry.unregister("api");

    expect(registry.has("api")).toBe(false);
  });

  it("returns correct size", () => {
    expect(registry.size).toBe(0);
    registry.register("api", createTestRuntime([]));
    expect(registry.size).toBe(1);
  });

  it("returns all IDs", () => {
    registry.register("api", createTestRuntime([]));
    registry.register("worker", createTestRuntime([]));

    expect(registry.getIds()).toEqual(["api", "worker"]);
  });

  it("checks all ready", () => {
    expect(registry.isAllReady()).toBe(true);

    const runtime = createTestRuntime([]);
    registry.register("api", runtime);
    expect(registry.isAllReady()).toBe(false);
  });

  it("returns status", async () => {
    const runtime = createTestRuntime([]);
    registry.register("api", runtime);
    await runtime.start();

    const status = registry.getStatus();
    expect(status["api"]?.state).toBe("running");
    expect(status["api"]?.ready).toBe(true);

    await runtime.stop();
  });

  it("startAll and stopAll", async () => {
    const module1 = createMockModuleHelper("mod1");
    const module2 = createMockModuleHelper("mod2");

    const runtime1 = createTestRuntime([module1]);
    const runtime2 = createTestRuntime([module2]);

    registry.register("r1", runtime1);
    registry.register("r2", runtime2);

    await registry.startAll();
    expect(runtime1.ready).toBe(true);
    expect(runtime2.ready).toBe(true);

    await registry.stopAll();
    expect(runtime1.state).toBe("stopped");
    expect(runtime2.state).toBe("stopped");
  });

  it("clear removes all", () => {
    registry.register("api", createTestRuntime([]));
    registry.register("worker", createTestRuntime([]));
    registry.clear();
    expect(registry.size).toBe(0);
  });
});

/* ─── Test Runtime ────────────────────────────────────────────────────────── */

describe("Test Runtime", () => {
  it("createTestRuntime creates a runtime", () => {
    const runtime = createTestRuntime([]);
    expect(runtime.state).toBe("created");
  });

  it("createTestRuntime with modules", async () => {
    const module = createMockModuleHelper("test-mod");
    const runtime = createTestRuntime([module]);

    await runtime.start();
    expect(runtime.state).toBe("running");
    expect(module.onInitialize).toHaveBeenCalledOnce();

    await runtime.stop();
  });

  it("withTestRuntime manages lifecycle", async () => {
    const module = createMockModuleHelper("test-mod");
    let capturedState = "";

    await withTestRuntime(
      async (runtime) => {
        capturedState = runtime.state;
        expect(runtime.ready).toBe(true);
      },
      [module],
    );

    expect(capturedState).toBe("running");
    expect(module.onInitialize).toHaveBeenCalledOnce();
    expect(module.onDestroy).toHaveBeenCalledOnce();
  });
});

/* ─── Dependency Graph ────────────────────────────────────────────────────── */

describe("DependencyGraph", () => {
  it("resolves linear dependencies", () => {
    const modules = new Map<string, readonly string[]>([
      ["a", []],
      ["b", ["a"]],
      ["c", ["b"]],
    ]);

    const result = resolveDependencies(modules);
    expect(result.order).toEqual(["a", "b", "c"]);
  });

  it("detects circular dependencies", () => {
    const modules = new Map<string, readonly string[]>([
      ["a", ["b"]],
      ["b", ["a"]],
    ]);

    const graph = buildDependencyGraph(modules);
    expect(graph.circularDependencies.length).toBeGreaterThan(0);
  });

  it("handles independent modules", () => {
    const modules = new Map<string, readonly string[]>([
      ["a", []],
      ["b", []],
      ["c", []],
    ]);

    const result = resolveDependencies(modules);
    expect(result.order).toHaveLength(3);
    expect(result.order).toContain("a");
    expect(result.order).toContain("b");
    expect(result.order).toContain("c");
  });
});

/* ─── Readiness Tracker ───────────────────────────────────────────────────── */

describe("ReadinessTracker", () => {
  it("starts not ready", () => {
    const tracker = new ReadinessTracker({ autoMarkReady: false });
    expect(tracker.isReady()).toBe(false);
  });

  it("marks ready", () => {
    const tracker = new ReadinessTracker({ autoMarkReady: false });
    tracker.markReady("All systems go");
    expect(tracker.isReady()).toBe(true);
  });

  it("marks not ready", () => {
    const tracker = new ReadinessTracker({ autoMarkReady: false });
    tracker.markReady("Ready");
    tracker.markNotReady("Problem detected");
    expect(tracker.isReady()).toBe(false);
  });

  it("getState returns current state", () => {
    const tracker = new ReadinessTracker({ autoMarkReady: false });
    const state = tracker.getState();
    expect(state.ready).toBe(false);
    expect(state.state).toBe("not_ready");
  });
});

/* ─── Signal Handler ──────────────────────────────────────────────────────── */

describe("SignalHandler", () => {
  it("registers and unregisters handlers", () => {
    const logger = createLogger({ name: "test" });
    const handler = new SignalHandler(logger, {
      handleSignals: false,
      handleFatalErrors: false,
    });

    const shutdownFn = vi.fn();
    handler.register(shutdownFn);
    handler.unregister();

    // No error thrown
    expect(true).toBe(true);
  });
});
