/**
 * @zudojs/lifecycle — Round 11 regression tests.
 *
 * One describe block per finding id.
 */

import { describe, it, expect } from "vitest";
import { LifecycleState } from "@zudojs/constants";
import { LifecycleManager } from "../src/index.js";

const tick = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

describe("CORE-01", () => {
  it("does not dispose a component while its abandoned stop() is still draining", async () => {
    const log: string[] = [];
    const manager = new LifecycleManager({ handleSignals: false });

    manager.register(
      {
        name: "db",
        start: async () => {
          log.push("start");
        },
        stop: async () => {
          log.push("stop:begin");
          await tick(200);
          log.push("stop:end");
        },
        dispose: async () => {
          log.push("dispose:end");
        },
      },
      { id: "db", timeout: 40 },
    );

    await manager.start();
    await manager.shutdown();

    expect(log).toContain("stop:end");
    expect(log.indexOf("stop:end")).toBeLessThan(log.indexOf("dispose:end"));
    expect(manager.state).toBe(LifecycleState.DISPOSED);
  });

  it("still honours the global shutdown deadline when a stop() never settles", async () => {
    const manager = new LifecycleManager({
      handleSignals: false,
      shutdownTimeout: 120,
    });

    manager.register(
      {
        name: "hung",
        start: async () => undefined,
        stop: () => new Promise<void>(() => undefined),
      },
      { id: "hung", timeout: 20 },
    );

    await manager.start();
    const began = Date.now();
    await manager.shutdown();

    expect(Date.now() - began).toBeLessThan(1500);
    expect(manager.state).toBe(LifecycleState.DISPOSED);
  });
});

describe("CORE-04", () => {
  it("starts a higher-priority component before a lower-priority sibling", async () => {
    const order: string[] = [];
    const manager = new LifecycleManager({ handleSignals: false });

    manager.register(
      {
        name: "low",
        start: async () => {
          order.push("low");
        },
      },
      { id: "low", priority: 0 },
    );
    manager.register(
      {
        name: "high",
        start: async () => {
          await tick(30);
          order.push("high");
        },
      },
      { id: "high", priority: 100 },
    );

    await manager.start();
    await manager.shutdown();

    expect(order).toEqual(["high", "low"]);
  });

  it("stops components in reverse priority order within a stage", async () => {
    const order: string[] = [];
    const manager = new LifecycleManager({ handleSignals: false });

    manager.register(
      {
        name: "low",
        start: async () => undefined,
        stop: async () => {
          await tick(30);
          order.push("low");
        },
      },
      { id: "low", priority: 0 },
    );
    manager.register(
      {
        name: "high",
        start: async () => undefined,
        stop: async () => {
          order.push("high");
        },
      },
      { id: "high", priority: 100 },
    );

    await manager.start();
    await manager.shutdown();

    expect(order).toEqual(["low", "high"]);
  });

  it("still runs equal-priority components concurrently", async () => {
    const manager = new LifecycleManager({ handleSignals: false });
    let running = 0;
    let peak = 0;

    for (const id of ["a", "b", "c"]) {
      manager.register(
        {
          name: id,
          start: async () => {
            running += 1;
            peak = Math.max(peak, running);
            await tick(20);
            running -= 1;
          },
        },
        { id },
      );
    }

    await manager.start();
    await manager.shutdown();

    expect(peak).toBe(3);
  });
});

describe("CORE-05", () => {
  it("throws typed lifecycle errors from the registry", async () => {
    const { LifecycleError } = await import("@zudojs/errors");
    const manager = new LifecycleManager({ handleSignals: false });

    manager.register({ name: "a" }, { id: "a" });

    expect(() => manager.register({ name: "a" }, { id: "a" })).toThrow(
      LifecycleError,
    );

    const dangling = new LifecycleManager({ handleSignals: false });
    dangling.register({ name: "b" }, { id: "b", dependsOn: ["missing"] });
    await expect(dangling.start()).rejects.toBeInstanceOf(Error);

    const frozen = new LifecycleManager({ handleSignals: false });
    frozen.register({ name: "c" }, { id: "c" });
    await frozen.start();
    expect(() => frozen.register({ name: "d" }, { id: "d" })).toThrow(
      LifecycleError,
    );
    await frozen.shutdown();
  });

  it("aborts withAbort with a typed lifecycle error", async () => {
    const { LifecycleError } = await import("@zudojs/errors");
    const { withAbort } = await import("../src/index.js");
    const controller = new AbortController();
    controller.abort();

    await expect(
      withAbort(async () => undefined, controller.signal),
    ).rejects.toBeInstanceOf(LifecycleError);
  });
});
