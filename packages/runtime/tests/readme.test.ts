import { describe, expect, it } from "vitest";
import type { Module } from "@zudojs/core";
import { createLogger } from "@zudojs/logger";
import { createContainer } from "@zudojs/container";
import { createEventBus } from "@zudojs/events";
import type { Event } from "@zudojs/events";

import { createRuntime } from "../src/index.js";
import type { RuntimeModuleEventPayload } from "../src/index.js";

// Executes the README snippets verbatim so a documented API that stops
// existing fails CI rather than shipping.
describe("README", () => {
  const database: Module = { id: "database", name: "Database", dependencies: [] };
  const api: Module = { id: "api", name: "API", dependencies: ["database"] };

  const logger = createLogger({ name: "readme" });
  const container = createContainer();

  it("quick start runs", async () => {
    const eventBus = createEventBus();

    const runtime = createRuntime(
      {
        modules: new Map([
          ["database", database],
          ["api", api],
        ]),
        logger,
        container,
        eventBus,
      },
      {
        environment: "production",
        applicationName: "my-app",
        handleSignals: false,
        handleFatalErrors: false,
      },
    );

    await runtime.start();
    expect(runtime.state).toBe("running");
    await runtime.stop();
    expect(runtime.state).toBe("stopped");
  });

  it("readiness and health snippet runs", async () => {
    const connected = { value: false };
    const runtime = createRuntime(
      {
        modules: new Map<string, Module>(),
        logger,
        container,
        eventBus: createEventBus(),
      },
      {
        environment: "test",
        applicationName: "my-app",
        handleSignals: false,
        handleFatalErrors: false,
      },
    );

    runtime.registerReadinessCheck("database", () => connected.value);

    await runtime.start();
    await runtime.runReadinessChecks();

    expect(runtime.ready).toBe(false);
    expect(runtime.health.state).toBe("degraded");
    expect(runtime.readiness.checks.get("database")?.ready).toBe(false);
    expect(
      typeof runtime.readiness.checks.get("database")?.durationMs,
    ).toBe("number");

    connected.value = true;
    await runtime.runReadinessChecks();

    expect(runtime.ready).toBe(true);
    expect(runtime.health.state).toBe("healthy");

    await runtime.stop();

    // The README promises these read live, on the failure path included.
    expect(runtime.context.stoppedAt).toBeInstanceOf(Date);
  });

  it("events snippet receives a module payload", async () => {
    const eventBus = createEventBus();
    const alerts: string[] = [];

    eventBus.on("runtime.module.failed", (event: Event) => {
      const { moduleId, moduleName, error, durationMs } =
        event.payload as RuntimeModuleEventPayload;
      alerts.push(
        `${moduleName} (${moduleId}) failed after ${typeof durationMs}ms: ${error?.message}`,
      );
    });

    const bad: Module = {
      id: "bad",
      name: "Bad",
      dependencies: [],
      onInitialize: async () => {
        throw new Error("boom");
      },
    };

    const runtime = createRuntime(
      {
        modules: new Map([["bad", bad]]),
        logger,
        container,
        eventBus,
      },
      {
        environment: "test",
        applicationName: "my-app",
        handleSignals: false,
        handleFatalErrors: false,
      },
    );

    await expect(runtime.start()).rejects.toThrow();
    await new Promise((resolve) => setImmediate(resolve));

    expect(alerts).toEqual(["Bad (bad) failed after numberms: boom"]);
  });

  it("options snippet is accepted in full", async () => {
    const runtime = createRuntime(
      {
        modules: new Map<string, Module>(),
        logger,
        container,
        eventBus: createEventBus(),
      },
      {
        environment: "production",
        applicationName: "my-app",
        applicationVersion: "1.4.0",
        runtimeId: "rt_custom",
        handleSignals: false,
        handleFatalErrors: false,
        startupTimeout: 60_000,
        shutdownTimeout: 30_000,
        emitEvents: true,
        trackReadiness: true,
        trackHealth: true,
        readinessCheckTimeout: 5_000,
        parallelInitialization: false,
        metadata: { region: "eu-west-1" },
      },
    );

    await runtime.start();
    expect(runtime.context.runtimeId).toBe("rt_custom");
    expect(runtime.context.metadata).toEqual({ region: "eu-west-1" });
    expect(runtime.context.applicationVersion).toBe("1.4.0");
    await runtime.stop();
  });

  it("module context snippet accepts configuration and application", async () => {
    const seen: string[] = [];

    const module: Module = {
      id: "m",
      name: "M",
      dependencies: [],
      onInitialize: async (context) => {
        seen.push(typeof context.getConfiguration());
        seen.push(String(context.hasModule("m")));
      },
    };

    const runtime = createRuntime(
      {
        modules: new Map([["m", module]]),
        logger,
        container,
        eventBus: createEventBus(),
      },
      {
        environment: "test",
        applicationName: "my-app",
        handleSignals: false,
        handleFatalErrors: false,
      },
    );

    await runtime.start();
    await runtime.stop();

    expect(seen).toEqual(["object", "true"]);
  });
});
