/**
 * Audit round 9 regressions for @zudojs/runtime.
 *
 * One describe block per finding id.
 */

import { describe, it, expect } from "vitest";
import type { Module } from "@zudojs/core";
import { createLogger } from "@zudojs/logger";
import { createContainer } from "@zudojs/container";
import { createEventBus } from "@zudojs/events";

import { createRuntime, resolveRuntimeOptions } from "../src/index.js";
import { ReadinessTracker } from "../src/readiness/index.js";
import {
  createMockModule,
  createTestRuntime,
} from "../src/testRuntime/index.js";

/** A module whose onInitialize blocks until `release()` is called. */
function gatedModule(id: string): { module: Module; release: () => void } {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  return {
    release,
    module: {
      id,
      name: id,
      onInitialize: async () => {
        await gate;
      },
    },
  };
}

describe("RUNTIME-R9-01 runtimeId is generated when omitted", () => {
  it("resolves an omitted runtimeId to a generated rt_ id", () => {
    const resolved = resolveRuntimeOptions({
      environment: "test",
      applicationName: "app",
    } as Parameters<typeof resolveRuntimeOptions>[0]);

    expect(resolved.runtimeId).toMatch(/^rt_[0-9a-f]{32}$/);
  });

  it("is unique per runtime and reaches the context and event payloads", async () => {
    const eventBus = createEventBus();
    const runtimeIds = new Set<unknown>();

    eventBus.onAny((event) => {
      runtimeIds.add((event.payload as { runtimeId?: unknown }).runtimeId);
    });

    const make = () =>
      createRuntime(
        {
          modules: new Map(),
          logger: createLogger({ name: "r9" }),
          container: createContainer(),
          eventBus,
        },
        {
          environment: "test",
          applicationName: "app",
          handleSignals: false,
          handleFatalErrors: false,
        },
      );

    const a = make();
    const b = make();

    expect(a.context.runtimeId).toMatch(/^rt_[0-9a-f]{32}$/);
    expect(b.context.runtimeId).not.toBe(a.context.runtimeId);

    await eventBus.start();
    await a.start();
    await a.stop();

    expect(runtimeIds.size).toBe(1);
    expect(runtimeIds.has(a.context.runtimeId)).toBe(true);
    expect(runtimeIds.has(undefined)).toBe(false);
  });

  it("still honours an explicit runtimeId", () => {
    const runtime = createTestRuntime([], { runtimeId: "rt_custom" as never });

    expect(runtime.context.runtimeId).toBe("rt_custom");
  });
});

describe("RUNTIME-R9-02 stop() during start() waits for startup instead of throwing", () => {
  it("stops the runtime once the in-flight start settles", async () => {
    const gated = gatedModule("slow");
    const runtime = createTestRuntime([gated.module]);

    const starting = runtime.start();
    expect(runtime.state).toBe("initializing");

    setTimeout(() => gated.release(), 10);

    // Previously: RuntimeStateError "Cannot stop a runtime in state initializing".
    await expect(runtime.stop()).resolves.toBeUndefined();

    await starting;
    expect(runtime.state).toBe("stopped");
  });

  it("stops a runtime whose startup then fails", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const failing: Module = {
      id: "failing",
      name: "failing",
      onInitialize: async () => {
        await gate;
        throw new Error("boom");
      },
    };
    const runtime = createTestRuntime([failing]);

    const starting = runtime.start();
    setTimeout(() => release(), 10);

    await expect(runtime.stop()).resolves.toBeUndefined();
    await expect(starting).rejects.toThrow(
      'Module "failing" failed during initialization.',
    );
    expect(runtime.state).toBe("stopped");
  });

  it("handles a SIGTERM that arrives while modules are still coming up", async () => {
    const gated = gatedModule("slow");
    const errors: string[] = [];
    const logger = createLogger({ name: "r9-signal" });
    const originalError = logger.error.bind(logger);
    logger.error = ((...args: Parameters<typeof logger.error>) => {
      errors.push(args[0]);
      originalError(...args);
    }) as typeof logger.error;

    const runtime = createRuntime(
      {
        modules: new Map([["slow", gated.module]]),
        logger,
        container: createContainer(),
        eventBus: createEventBus(),
      },
      {
        environment: "test",
        applicationName: "app",
        handleSignals: true,
        handleFatalErrors: false,
        emitEvents: false,
      },
    );

    const before = process.listenerCount("SIGTERM");
    const starting = runtime.start();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(process.listenerCount("SIGTERM")).toBe(before + 1);

    process.emit("SIGTERM" as never);
    await new Promise((resolve) => setTimeout(resolve, 5));

    gated.release();
    await starting;
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Previously: "Shutdown failed." was logged and the runtime ran on.
    expect(errors).toEqual([]);
    expect(runtime.state).toBe("stopped");
    expect(process.listenerCount("SIGTERM")).toBe(before);
  });
});

describe("RUNTIME-R9-03 removing the last readiness check restores readiness", () => {
  it("returns a running runtime to ready when its only failing check is removed", async () => {
    const runtime = createTestRuntime([createMockModule("a")]);
    await runtime.start();
    expect(runtime.ready).toBe(true);

    runtime.registerReadinessCheck("db", () => false);
    await runtime.runReadinessChecks();
    expect(runtime.ready).toBe(false);
    expect(runtime.health.state).toBe("degraded");

    expect(runtime.removeReadinessCheck("db")).toBe(true);

    // Previously: ready stayed false and readiness.state "degraded" while
    // health (seeing no checks) reported "healthy".
    expect(runtime.ready).toBe(true);
    expect(runtime.readiness.state).toBe("ready");
    expect(runtime.health.state).toBe("healthy");

    await runtime.stop();
  });

  it("does not mark a tracker ready that was never ready", () => {
    const tracker = new ReadinessTracker();

    tracker.registerCheck("db", () => false);
    expect(tracker.removeCheck("db")).toBe(true);

    expect(tracker.isReady()).toBe(false);
    expect(tracker.getState().state).toBe("not_ready");
  });

  it("re-evaluates the remaining checks when more than one is registered", async () => {
    const tracker = new ReadinessTracker();
    tracker.markReady();
    tracker.registerCheck("ok", () => true);
    tracker.registerCheck("bad", () => false);
    await tracker.runChecks();
    expect(tracker.isReady()).toBe(false);

    tracker.removeCheck("bad");
    expect(tracker.isReady()).toBe(true);
    expect(tracker.getState().state).toBe("ready");
  });
});
