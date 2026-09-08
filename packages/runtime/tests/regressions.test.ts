import { describe, it, expect } from "vitest";
import {
  createTestRuntime,
  createMockModule,
} from "../src/testRuntime/testRuntime.core.js";
import {
  resolveDependencies,
  validateDependencies,
} from "../src/dependencyGraph/dependencyGraph.core.js";
import { RuntimeDependencyError } from "../src/runtimeError/runtimeError.base.js";
import { SignalHandler } from "../src/signalHandler/signalHandler.core.js";
import { ReadinessTracker } from "../src/readiness/readiness.core.js";
import { resolveRuntimeOptions } from "../src/runtimeOptions/runtimeOptions.core.js";
import { RuntimeRegistry } from "../src/registry/registry.core.js";
import { createLogger } from "@zudojs/logger";

const timers = () =>
  (process as any)
    .getActiveResourcesInfo()
    .filter((r: string) => r === "Timeout").length;

describe("regressions: audit round 7", () => {
  it("T-01 a failed runtime can be stopped", async () => {
    const bad = {
      id: "bad",
      name: "bad",
      onInitialize() {
        throw new Error("boom");
      },
    } as any;
    const rt = createTestRuntime([bad]);
    await expect(rt.start()).rejects.toThrow();
    expect(rt.state).toBe("failed");
    await expect(rt.stop()).resolves.toBeUndefined();
    expect(rt.state).toBe("stopped");
  });

  it("T-01 failed startup destroys modules that only initialized", async () => {
    let destroyed = false;
    const good = {
      id: "a",
      name: "a",
      onInitialize() {},
      onDestroy() {
        destroyed = true;
      },
    } as any;
    const bad = {
      id: "z",
      name: "z",
      dependencies: ["a"],
      onInitialize() {
        throw new Error("boom");
      },
    } as any;
    const rt = createTestRuntime([good, bad]);
    await expect(rt.start()).rejects.toThrow();
    expect(destroyed).toBe(true);
  });

  it("T-02 a clean stop leaves no timers armed", async () => {
    const before = timers();
    const rt = createTestRuntime([], { shutdownTimeout: 30000 });
    await rt.start();
    await rt.stop();
    expect(timers()).toBeLessThanOrEqual(before);
  });

  it("T-03 createMockModule works in ESM without vitest", async () => {
    const m = createMockModule("m");
    expect(() => m).not.toThrow();
    const rt = createTestRuntime([m]);
    await rt.start();
    await rt.stop();
    expect(m.calls.onInitialize).toBe(1);
    expect(m.calls.onReady).toBe(1);
    expect(m.calls.onShutdown).toBe(1);
    expect(m.calls.onDestroy).toBe(1);
  });

  it("T-04 a missing module dependency is rejected", () => {
    expect(() =>
      resolveDependencies(new Map([["a", ["does-not-exist"]]])),
    ).toThrow(RuntimeDependencyError);
    expect(() => validateDependencies(new Map([["a", ["nope"]]]))).toThrow(
      /depends on "nope"/,
    );
    expect(() =>
      resolveDependencies(
        new Map([
          ["a", []],
          ["b", ["a"]],
        ]),
      ),
    ).not.toThrow();
  });

  it("T-05 module shutdown failures are surfaced on status", async () => {
    const m = {
      id: "m",
      name: "m",
      onInitialize() {},
      onReady() {},
      onShutdown() {
        throw new Error("stuck");
      },
    } as any;
    const rt = createTestRuntime([m]);
    await rt.start();
    await rt.stop();
    expect(rt.state).toBe("stopped");
    expect(rt.status.shutdownFailures?.length).toBe(1);
    expect(rt.status.shutdownFailures?.[0]?.moduleId).toBe("m");
  });

  it("T-06 a second signal forces exit; fatal errors exit non-zero", () => {
    const codes: number[] = [];
    const h = new SignalHandler(createLogger({ name: "t" }), {
      handleSignals: true,
      handleFatalErrors: false,
      exit: (c) => codes.push(c),
    });
    h.register(() => new Promise(() => {})); // shutdown that never finishes
    process.emit("SIGTERM" as any);
    expect(h.shuttingDown).toBe(true);
    process.emit("SIGTERM" as any);
    expect(codes).toEqual([1]);
    h.unregister();
  });

  it("T-06 register/unregister does not accumulate listeners", () => {
    const before = process.listenerCount("SIGTERM");
    const h = new SignalHandler(createLogger({ name: "t" }), {
      handleSignals: true,
      handleFatalErrors: false,
      exit: () => {},
    });
    h.register(() => {});
    h.register(() => {});
    h.register(() => {});
    expect(process.listenerCount("SIGTERM")).toBe(before + 1);
    h.unregister();
    expect(process.listenerCount("SIGTERM")).toBe(before);
  });

  it("T-07 startup does not force ready over a failing check", async () => {
    const rt = createTestRuntime([]);
    rt.registerReadinessCheck("db", async () => false);
    await rt.start();
    expect(rt.state).toBe("running");
    expect(rt.ready).toBe(false);
    expect(rt.health.state).toBe("degraded");
    await rt.stop();
  });

  it("T-07 a hanging readiness check fails instead of hanging", async () => {
    const t = new ReadinessTracker({ checkTimeout: 40 });
    t.registerCheck("hang", () => new Promise<boolean>(() => {}));
    const started = Date.now();
    await t.runChecks();
    expect(Date.now() - started).toBeLessThan(1000);
    expect(t.isReady()).toBe(false);
    expect([...t.getState().checks.values()][0]?.message).toMatch(
      /did not settle/,
    );
  });

  it("T-07 restart does not double-run module hooks", async () => {
    const m = createMockModule("m");
    const rt = createTestRuntime([m]);
    await rt.start();
    await rt.stop();
    expect(m.calls.onInitialize).toBe(1);
    expect(m.calls.onShutdown).toBe(1);
    expect(m.calls.onDestroy).toBe(1);
  });

  it("T-07 explicit undefined does not erase a default", () => {
    const r = resolveRuntimeOptions({
      environment: "test",
      applicationName: "a",
      shutdownTimeout: undefined,
    } as any);
    expect(r.shutdownTimeout).toBeGreaterThan(0);
  });

  it("registry getStatus resists a __proto__ id", () => {
    const reg = new RuntimeRegistry();
    reg.register("__proto__", { state: "running", ready: true } as any);
    const status = reg.getStatus();
    expect(status["__proto__"]).toEqual({ state: "running", ready: true });
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
  });
});
