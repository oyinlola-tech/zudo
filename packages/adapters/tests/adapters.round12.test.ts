import { describe, it, expect } from "vitest";

import {
  AdapterRegistry,
  AdapterInitializationError,
  AdapterOperationError,
  AdapterTimeoutError,
  collectAdapterHealth,
  configureAdapter,
  createMockAdapter,
  runAdapterLifecycle,
  withRetry,
} from "../src/index.js";
import type { Adapter, AdapterCapabilities } from "../src/index.js";

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const rejection = (run: Promise<unknown>): Promise<AggregateError> =>
  run.then(
    () => {
      throw new Error("expected the operation to reject");
    },
    (error: unknown) => error as AggregateError,
  );

function recording(name: string, calls: string[]): Adapter {
  return createMockAdapter({
    name,
    initialize: () => {
      calls.push(`init:${name}`);
    },
    start: () => {
      calls.push(`start:${name}`);
    },
    stop: () => {
      calls.push(`stop:${name}`);
    },
    dispose: () => {
      calls.push(`dispose:${name}`);
    },
  });
}

describe("#97 teardown runs in reverse registration order", () => {
  it("stops and disposes last-registered first, starts first-registered first", async () => {
    const calls: string[] = [];
    const registry = new AdapterRegistry();
    for (const name of ["a", "b", "c"]) registry.register(recording(name, calls));

    await registry.initializeAll();
    await registry.startAll();
    await registry.stopAll();
    await registry.disposeAll();

    expect(calls).toEqual([
      "init:a", "init:b", "init:c",
      "start:a", "start:b", "start:c",
      "stop:c", "stop:b", "stop:a",
      "stop:c", "dispose:c", "stop:b", "dispose:b", "stop:a", "dispose:a",
    ]);
  });
});

describe("#98 capabilities are open", () => {
  it("accepts and finds a business capability", () => {
    const capabilities: AdapterCapabilities = { http: true, refunds: true };
    const registry = new AdapterRegistry();
    registry.register(createMockAdapter({ name: "stripe", capabilities }));
    registry.register(createMockAdapter({ name: "cash", capabilities: { http: true } }));

    expect(registry.findByCapability("refunds").map((a) => a.name)).toEqual(["stripe"]);
    expect(registry.supports("stripe", "refunds")).toBe(true);
    expect(registry.supports("cash", "refunds")).toBe(false);
    expect(registry.findByCapability("http")).toHaveLength(2);
    expect(() => registry.requireCapability("cash", "refunds")).toThrow(/refunds/);
  });
});

describe("#99 lifecycle failures are typed and bounded", () => {
  it("names the adapter in initializeAll and startAll failures", async () => {
    const registry = new AdapterRegistry();
    const cause = new Error("no socket");
    registry.register(
      createMockAdapter({
        name: "db",
        initialize: () => Promise.reject(cause),
        start: () => {
          throw new Error("not initialised");
        },
      }),
    );
    registry.register(createMockAdapter({ name: "fine" }));

    const init = await rejection(registry.initializeAll());
    expect(init).toBeInstanceOf(AggregateError);
    expect(init.errors).toHaveLength(1);
    expect(init.errors[0]).toBeInstanceOf(AdapterInitializationError);
    expect((init.errors[0] as AdapterInitializationError).adapter).toBe("db");
    expect((init.errors[0] as Error).cause).toBe(cause);

    const start = await rejection(registry.startAll());
    expect(start.errors[0]).toBeInstanceOf(AdapterOperationError);
    expect((start.errors[0] as Error).message).toMatch(/"db" operation "start" failed/);
  });

  it("applies timeout and retry to lifecycle hooks", async () => {
    let attempts = 0;
    const flaky = createMockAdapter({
      name: "flaky",
      start: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("first try fails");
      },
    });
    await runAdapterLifecycle(flaky, "start", { retry: { attempts: 2 } });
    expect(attempts).toBe(2);

    const slow = createMockAdapter({ name: "slow", initialize: () => wait(200) });
    const registry = new AdapterRegistry();
    registry.register(slow);
    const failure = await rejection(registry.initializeAll({ timeout: 10 }));
    expect(failure.errors[0]).toBeInstanceOf(AdapterTimeoutError);
    expect((failure.errors[0] as AdapterTimeoutError).adapter).toBe("slow");
  });

  it("exports the helpers the README names", () => {
    expect(typeof withRetry).toBe("function");
    expect(typeof collectAdapterHealth).toBe("function");
    expect(typeof configureAdapter).toBe("function");
    expect(typeof runAdapterLifecycle).toBe("function");
  });
});

describe("#100 health report key order", () => {
  it("keys adapters in registration order regardless of completion order", async () => {
    const registry = new AdapterRegistry();
    registry.register(
      createMockAdapter({
        name: "slow",
        health: async () => {
          await wait(30);
          return { status: "healthy", timestamp: Date.now() };
        },
      }),
    );
    registry.register(
      createMockAdapter({
        name: "fast",
        health: () => ({ status: "degraded", timestamp: Date.now() }),
      }),
    );

    const report = await registry.healthAll();
    expect(Object.keys(report.adapters)).toEqual(["slow", "fast"]);
    expect(report.status).toBe("degraded");
  });
});
