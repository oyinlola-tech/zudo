import { describe, it, expect, vi } from "vitest";

import { createLogger } from "@zudojs/logger";
import { createContainer } from "@zudojs/container";
import { createEventBus } from "@zudojs/events";
import type { Module } from "@zudojs/core";

import { DefaultRuntime } from "../src/runtime/runtime.core.js";
import type { RuntimeDependencies } from "../src/runtime/runtime.core.js";
import type { RuntimeOptions } from "../src/runtimeOptions/index.js";
import { ReadinessTracker } from "../src/readiness/index.js";
import { computeRuntimeHealth } from "../src/health/index.js";

function createModule(id: string): Module {
  return {
    id,
    name: `Module ${id}`,
    dependencies: [],
    onInitialize: vi.fn().mockResolvedValue(undefined),
    onReady: vi.fn().mockResolvedValue(undefined),
    onShutdown: vi.fn().mockResolvedValue(undefined),
    onDestroy: vi.fn().mockResolvedValue(undefined),
  };
}

function createDependencies(modules: Module[] = []): RuntimeDependencies {
  const moduleMap = new Map<string, Module>();
  for (const module of modules) {
    moduleMap.set(module.id, module);
  }

  return {
    modules: moduleMap,
    logger: createLogger({ name: "test-runtime" }),
    container: createContainer(),
    eventBus: createEventBus(),
  };
}

function createOptions(
  overrides: Partial<RuntimeOptions> = {},
): RuntimeOptions {
  return {
    environment: "test",
    applicationName: "test-app",
    handleSignals: false,
    handleFatalErrors: false,
    shutdownTimeout: 5000,
    ...overrides,
  };
}

/* ─── ReadinessTracker check retention ────────────────────────────────────── */

describe("ReadinessTracker checks", () => {
  it("retains the registered function so it can be re-evaluated", async () => {
    const tracker = new ReadinessTracker();
    let healthy = false;

    tracker.registerCheck("db", () => healthy);

    // Registration alone does not run the check.
    expect(tracker.isReady()).toBe(false);
    expect(tracker.getState().checks.get("db")?.ready).toBe(false);

    await tracker.runChecks();
    expect(tracker.isReady()).toBe(false);

    healthy = true;
    await tracker.runChecks();
    expect(tracker.isReady()).toBe(true);
    expect(tracker.getState().checks.get("db")?.ready).toBe(true);
  });

  it("runs checks supplied as initialChecks", async () => {
    const check = vi.fn().mockReturnValue(true);
    const tracker = new ReadinessTracker({
      initialChecks: [{ name: "seeded", check }],
    });

    expect(check).not.toHaveBeenCalled();

    await tracker.runChecks();

    expect(check).toHaveBeenCalledTimes(1);
    expect(tracker.isReady()).toBe(true);
  });

  it("updateCheck re-runs the registered function without re-supplying it", async () => {
    const tracker = new ReadinessTracker();
    const check = vi.fn().mockReturnValue(true);

    tracker.registerCheck("cache", check);
    await tracker.updateCheck("cache");

    expect(check).toHaveBeenCalledTimes(1);
    expect(tracker.getState().checks.get("cache")?.ready).toBe(true);
  });

  it("updateCheck replaces the stored function when one is supplied", async () => {
    const tracker = new ReadinessTracker();
    const original = vi.fn().mockReturnValue(false);
    const replacement = vi.fn().mockReturnValue(true);

    tracker.registerCheck("queue", original);
    await tracker.updateCheck("queue", replacement);
    await tracker.runChecks();

    expect(replacement).toHaveBeenCalledTimes(2);
    expect(original).not.toHaveBeenCalled();
  });

  it("rejects updating a check that was never registered", async () => {
    const tracker = new ReadinessTracker();
    await expect(tracker.updateCheck("missing")).rejects.toThrow(
      /not registered/,
    );
  });

  it("records the failure message and duration of a throwing check", async () => {
    const tracker = new ReadinessTracker();
    tracker.registerCheck("flaky", () => {
      throw new Error("connection refused");
    });

    await tracker.runChecks();

    const check = tracker.getState().checks.get("flaky");
    expect(check?.ready).toBe(false);
    expect(check?.message).toContain("connection refused");
    expect(check?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("removeCheck drops the check and re-evaluates readiness", async () => {
    const tracker = new ReadinessTracker();
    tracker.registerCheck("good", () => true);
    tracker.registerCheck("bad", () => false);

    await tracker.runChecks();
    expect(tracker.isReady()).toBe(false);

    expect(tracker.removeCheck("bad")).toBe(true);
    expect(tracker.isReady()).toBe(true);
    expect(tracker.removeCheck("bad")).toBe(false);
  });
});

/* ─── Health computation ──────────────────────────────────────────────────── */

describe("computeRuntimeHealth", () => {
  it("maps lifecycle states that do not depend on checks", () => {
    const readiness = new ReadinessTracker().getState();

    expect(computeRuntimeHealth("created", readiness).state).toBe("unknown");
    expect(computeRuntimeHealth("starting", readiness).state).toBe("starting");
    expect(computeRuntimeHealth("stopping", readiness).state).toBe("stopping");
    expect(computeRuntimeHealth("stopped", readiness).state).toBe("unknown");
    expect(computeRuntimeHealth("failed", readiness).state).toBe("unhealthy");
  });

  it("is healthy while running with no checks registered", () => {
    const readiness = new ReadinessTracker().getState();
    expect(computeRuntimeHealth("running", readiness).state).toBe("healthy");
  });

  it("is degraded while running with a failing check", async () => {
    const tracker = new ReadinessTracker();
    tracker.registerCheck("db", () => false);
    await tracker.runChecks();

    const health = computeRuntimeHealth("running", tracker.getState());

    expect(health.state).toBe("degraded");
    expect(health.checks).toHaveLength(1);
    expect(health.checks[0]?.healthy).toBe(false);
  });
});

/* ─── Runtime health and live context ─────────────────────────────────────── */

describe("Runtime health", () => {
  it("reports health across the lifecycle", async () => {
    const runtime = new DefaultRuntime(
      createDependencies([createModule("a")]),
      createOptions(),
    );

    expect(runtime.health.state).toBe("unknown");

    await runtime.start();
    expect(runtime.health.state).toBe("healthy");

    await runtime.stop();
    expect(runtime.health.state).toBe("unknown");
  });

  it("goes degraded when a readiness check fails on a running runtime", async () => {
    const runtime = new DefaultRuntime(createDependencies(), createOptions());

    await runtime.start();
    expect(runtime.health.state).toBe("healthy");
    expect(runtime.ready).toBe(true);

    runtime.registerReadinessCheck("db", () => false);
    await runtime.runReadinessChecks();

    expect(runtime.health.state).toBe("degraded");
    expect(runtime.ready).toBe(false);
    expect(runtime.readiness.checks.get("db")?.ready).toBe(false);

    expect(runtime.removeReadinessCheck("db")).toBe(true);
    expect(runtime.health.state).toBe("healthy");

    await runtime.stop();
  });

  it("emits runtime.health.changed when health moves", async () => {
    const dependencies = createDependencies();
    const published: string[] = [];

    dependencies.eventBus.on("runtime.health.changed", (event) => {
      const payload = event.payload as { currentState: string };
      published.push(payload.currentState);
    });

    const runtime = new DefaultRuntime(
      dependencies,
      createOptions({ emitEvents: true }),
    );

    await runtime.start();
    await new Promise((resolve) => setImmediate(resolve));

    expect(published).toContain("healthy");

    await runtime.stop();
  });
});

describe("Runtime context", () => {
  it("reflects the current state rather than a construction-time snapshot", async () => {
    const runtime = new DefaultRuntime(createDependencies(), createOptions());

    expect(runtime.context.state).toBe("created");
    expect(runtime.context.ready).toBe(false);
    expect(runtime.context.startedAt).toBeUndefined();

    await runtime.start();

    expect(runtime.context.state).toBe("running");
    expect(runtime.context.ready).toBe(true);
    expect(runtime.context.status.state).toBe("running");
    expect(runtime.context.health.state).toBe("healthy");
    expect(runtime.context.startedAt).toBeInstanceOf(Date);

    await runtime.stop();

    expect(runtime.context.state).toBe("stopped");
    expect(runtime.context.ready).toBe(false);
  });

  it("surfaces startedAt and stoppedAt on the status", async () => {
    const runtime = new DefaultRuntime(createDependencies(), createOptions());

    expect(runtime.status.startedAt).toBeUndefined();

    await runtime.start();
    expect(runtime.status.startedAt).toBeInstanceOf(Date);
    expect(runtime.status.running).toBe(true);

    await runtime.stop();
    expect(runtime.status.stoppedAt).toBeInstanceOf(Date);
    expect(runtime.status.running).toBe(false);
  });
});
