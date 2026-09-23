/**
 * Batch-7 lesson-writer regression tests for @zudojs/runtime.
 */

import { describe, expect, it } from "vitest";
import type { Module } from "@zudojs/core";
import { createLogger } from "@zudojs/logger";
import {
  ContainerScope,
  createContainer,
  createToken,
} from "@zudojs/container";
import type { Container } from "@zudojs/container";
import { createEventBus } from "@zudojs/events";

import {
  canTransition,
  createRuntime,
  RuntimeStartError,
} from "../src/index.js";
import { createTestRuntime } from "../src/testRuntime/index.js";
import type { Runtime, RuntimeState } from "../src/index.js";

const logger = createLogger({ name: "batch7" });

function build(
  modules: readonly Module[],
  container: Container = createContainer(),
  extra: { readonly disposeContainerOnStop?: boolean } = {},
) {
  const eventBus = createEventBus();
  const runtime = createRuntime(
    {
      modules: new Map(modules.map((module) => [module.id, module])),
      logger,
      container,
      eventBus,
    },
    {
      environment: "test",
      applicationName: "batch7",
      handleSignals: false,
      handleFatalErrors: false,
      ...extra,
    },
  );
  return { runtime, eventBus, container };
}

describe("BATCH7-RUNTIME-6: the documented state machine is walked in order", () => {
  it("hooks see initializing, then starting; start ends in running", async () => {
    const seen: RuntimeState[] = [];
    let runtime: Runtime | undefined;

    const probe: Module = {
      id: "probe",
      name: "Probe",
      onInitialize: () => {
        seen.push(runtime!.state);
      },
      onReady: () => {
        seen.push(runtime!.state);
      },
    };

    ({ runtime } = build([probe]));
    await runtime.start();

    expect(seen).toEqual(["initializing", "starting"]);
    expect(runtime.state).toBe("running");
    await runtime.stop();
  });

  it("publishes runtime.initialized and runtime.starting in order", async () => {
    const { runtime, eventBus } = build([]);
    const order: string[] = [];

    for (const type of [
      "runtime.initializing",
      "runtime.initialized",
      "runtime.starting",
      "runtime.running",
    ]) {
      eventBus.on(type, () => {
        order.push(type);
      });
    }

    await runtime.start();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(order).toEqual([
      "runtime.initializing",
      "runtime.initialized",
      "runtime.starting",
      "runtime.running",
    ]);
    await runtime.stop();
  });

  it("no longer allows skipping initialized/starting", () => {
    expect(canTransition("initializing", "initialized")).toBe(true);
    expect(canTransition("initialized", "starting")).toBe(true);
    expect(canTransition("starting", "running")).toBe(true);
    expect(canTransition("initializing", "running")).toBe(false);
    expect(canTransition("initialized", "running")).toBe(false);
  });

  it("an onReady failure still ends in failed", async () => {
    const broken: Module = {
      id: "broken",
      name: "Broken",
      onReady: () => {
        throw new Error("boom");
      },
    };
    const { runtime } = build([broken]);

    await expect(runtime.start()).rejects.toThrow();
    expect(runtime.state).toBe("failed");
    await runtime.stop();
  });
});

describe("BATCH7-RUNTIME-7: a failed start wraps the original error in cause", () => {
  it("rejects with RuntimeStartError whose cause is the module's error", async () => {
    class DbDown extends Error {}
    const original = new DbDown("database unreachable");
    const database: Module = {
      id: "database",
      name: "Database",
      onInitialize: () => {
        throw original;
      },
    };
    const { runtime } = build([database]);

    const error = await runtime.start().then(
      () => undefined,
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(RuntimeStartError);
    expect((error as RuntimeStartError).cause).toBe(original);
    expect((error as RuntimeStartError).phase).toBe("initialize");
    expect((error as RuntimeStartError).failedModuleId).toBe("database");
    await runtime.stop();
  });
});

describe("BATCH7-RUNTIME-8: container ownership on stop", () => {
  const DISPOSED = createToken<{ disposed: boolean }>("probe");

  function withProbe(container: Container) {
    const probe = {
      disposed: false,
      dispose: () => {
        probe.disposed = true;
      },
    };
    container.registerFactory(DISPOSED, () => probe, [], {
      scope: ContainerScope.SINGLETON,
    });
    container.resolve(DISPOSED);
    return probe;
  }

  it("leaves a caller-supplied container alone by default", async () => {
    const container = createContainer();
    const probe = withProbe(container);
    const { runtime } = build([], container);

    await runtime.start();
    await runtime.stop();

    expect(probe.disposed).toBe(false);
    expect(container.resolve(DISPOSED)).toBe(probe);
    await container.dispose();
  });

  it("disposes the container when disposeContainerOnStop is set", async () => {
    const container = createContainer();
    const probe = withProbe(container);
    const { runtime } = build([], container, { disposeContainerOnStop: true });

    await runtime.start();
    await runtime.stop();

    expect(probe.disposed).toBe(true);
  });

  it("disposes it on stop() of a runtime that never started", async () => {
    const container = createContainer();
    const probe = withProbe(container);
    const { runtime } = build([], container, { disposeContainerOnStop: true });

    await runtime.stop();

    expect(probe.disposed).toBe(true);
  });

  it("createTestRuntime owns and disposes the container it creates", async () => {
    const runtime = createTestRuntime([]);
    const container = runtime.context.container as Container;
    const probe = withProbe(container);

    await runtime.start();
    await runtime.stop();

    expect(probe.disposed).toBe(true);
  });
});
