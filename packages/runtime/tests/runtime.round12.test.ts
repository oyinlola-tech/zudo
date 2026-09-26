/**
 * Round 12 regression tests for @zudojs/runtime.
 *
 * One describe block per academy finding; each test reproduced the
 * finding against the source before the fix was written.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import type { Module } from "@zudojs/core";
import { ReadinessTracker } from "../src/readiness/index.js";
import { createTestRuntime } from "../src/testRuntime/index.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("#70 readiness never flips back to ready during or after stop()", () => {
  it("runReadinessChecks() while stopping keeps ready false", async () => {
    let release: (() => void) | undefined;
    const slow: Module = {
      id: "slow",
      name: "slow",
      dependencies: [],
      onShutdown: () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    };

    const runtime = createTestRuntime([slow]);
    runtime.registerReadinessCheck("db", () => true);

    await runtime.start();
    expect(runtime.ready).toBe(true);

    const stopping = runtime.stop();
    expect(runtime.state).toBe("stopping");

    await runtime.runReadinessChecks();

    expect(runtime.ready).toBe(false);
    expect(runtime.readiness.state).toBe("shutting_down");
    expect(runtime.readiness.checks.get("db")?.ready).toBe(true);

    release?.();
    await stopping;
    expect(runtime.state).toBe("stopped");

    await runtime.runReadinessChecks();

    expect(runtime.ready).toBe(false);
    expect(runtime.readiness.state).toBe("shutting_down");
  });

  it("the tracker keeps shutting_down through runChecks()", async () => {
    const tracker = new ReadinessTracker();
    tracker.registerCheck("ok", () => true);

    await tracker.runChecks();
    expect(tracker.isReady()).toBe(true);

    tracker.setState("shutting_down", "Runtime is shutting down.");
    await tracker.runChecks();

    expect(tracker.isReady()).toBe(false);
    expect(tracker.getState().state).toBe("shutting_down");
    expect(tracker.getState().reason).toBe("Runtime is shutting down.");
  });

  it("a manual markNotReady() holds until markReady() is called", async () => {
    const tracker = new ReadinessTracker();
    tracker.registerCheck("ok", () => true);

    await tracker.runChecks();
    expect(tracker.isReady()).toBe(true);

    tracker.markNotReady("Draining for maintenance.");
    await tracker.runChecks();

    expect(tracker.isReady()).toBe(false);
    expect(tracker.getState().state).toBe("degraded");
    expect(tracker.getState().reason).toBe("Draining for maintenance.");

    tracker.markReady();
    await tracker.runChecks();

    expect(tracker.isReady()).toBe(true);
    expect(tracker.getState().state).toBe("ready");
  });
});

describe("#71 optional checks, failure messages and reasons", () => {
  it("a failing non-critical check is reported but does not gate readiness", async () => {
    const runtime = createTestRuntime([]);
    runtime.registerReadinessCheck("cache", () => false, { critical: false });
    runtime.registerReadinessCheck("db", () => true);

    await runtime.start();

    expect(runtime.ready).toBe(true);
    expect(runtime.readiness.state).toBe("ready");

    const cache = runtime.readiness.checks.get("cache");
    expect(cache?.ready).toBe(false);
    expect(cache?.critical).toBe(false);
    expect(cache?.message).toBe("Check returned false.");
    expect(runtime.readiness.checks.get("db")?.critical).toBe(true);

    // Health still surfaces every check, so operators can see it.
    expect(runtime.health.state).toBe("degraded");

    await runtime.stop();
  });

  it("a failing critical check names itself in the reason", async () => {
    const tracker = new ReadinessTracker({
      initialChecks: [
        { name: "queue", check: () => true },
        { name: "search", check: () => false },
        { name: "metrics", check: () => false, critical: false },
      ],
    });

    await tracker.runChecks();

    const state = tracker.getState();
    expect(state.ready).toBe(false);
    expect(state.state).toBe("not_ready");
    expect(state.reason).toBe("Readiness checks failing: search.");
    expect(state.checks.get("search")?.message).toBe("Check returned false.");
    expect(state.checks.get("metrics")?.critical).toBe(false);
  });

  it("registering a check without options keeps it critical", async () => {
    const tracker = new ReadinessTracker();
    tracker.registerCheck("db", () => false);

    await tracker.runChecks();

    expect(tracker.getState().checks.get("db")?.critical).toBe(true);
    expect(tracker.isReady()).toBe(false);
  });
});

describe("#76 the readiness check timeout keeps the event loop alive", () => {
  it("does not unref the timer that bounds a check", async () => {
    const realSetTimeout = globalThis.setTimeout;
    const unrefDelays: unknown[] = [];

    vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      handler: Parameters<typeof setTimeout>[0],
      delay?: number,
      ...args: unknown[]
    ) => {
      const timer = realSetTimeout(handler, delay, ...args);
      const unref = timer.unref.bind(timer);
      timer.unref = () => {
        unrefDelays.push(delay);
        return unref();
      };
      return timer;
    }) as typeof setTimeout);

    const tracker = new ReadinessTracker({ checkTimeout: 25 });
    tracker.registerCheck("hang", () => new Promise<boolean>(() => {}));

    await tracker.runChecks();

    expect(tracker.getState().checks.get("hang")?.ready).toBe(false);
    expect(tracker.getState().checks.get("hang")?.message).toMatch(/did not settle within 25ms/);
    expect(unrefDelays).not.toContain(25);
  });
});
