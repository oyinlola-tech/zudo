/**
 * @zudojs/lifecycle — Round 10 regression tests.
 */

import { describe, it, expect, vi } from "vitest";
import { LifecycleState } from "@zudojs/constants";
import {
  LifecycleManager,
  installSignalHandlers,
  withTimeout,
} from "../src/index.js";

const tick = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

describe("runtime/LC-01", () => {
  it("rejects NaN and negative timeouts at registration", () => {
    const manager = new LifecycleManager({ handleSignals: false });
    expect(() => manager.register({ name: "a" }, { timeout: Number.NaN })).toThrow(RangeError);
    expect(() => manager.register({ name: "b" }, { timeout: -1 })).toThrow(RangeError);
  });

  it("treats timeout: Infinity as unbounded instead of firing after 1 ms", async () => {
    const manager = new LifecycleManager({ handleSignals: false });
    manager.register({ name: "slow", start: () => tick(30) }, { timeout: Infinity });

    await manager.start();
    expect(manager.state).toBe(LifecycleState.READY);
    await manager.shutdown();
  });

  it("clamps a finite timeout above the timer limit instead of firing after 1 ms", async () => {
    const manager = new LifecycleManager({ handleSignals: false });
    manager.register({ name: "slow", start: () => tick(20) }, { timeout: 3_000_000_000 });

    await manager.start();
    expect(manager.state).toBe(LifecycleState.READY);
    await manager.shutdown();
  });

  it("withTimeout rejects a negative budget without crashing in a timer", async () => {
    await expect(withTimeout(async () => 1, -5, "c", "start")).rejects.toThrow(RangeError);
  });
});

describe("runtime/LC-02", () => {
  it("does not retry a timed-out hook while it is still running", async () => {
    let calls = 0;
    let running = 0;
    let maxRunning = 0;
    let stopDuringStart = false;
    const manager = new LifecycleManager({ handleSignals: false });
    manager.register(
      {
        name: "web",
        start: async () => {
          calls += 1;
          running += 1;
          maxRunning = Math.max(maxRunning, running);
          await tick(100);
          running -= 1;
        },
        stop: async () => {
          stopDuringStart ||= running > 0;
        },
      },
      { timeout: 30, retry: { attempts: 2, delay: 1 } },
    );

    await expect(manager.start()).rejects.toThrow();
    await manager.shutdown();

    expect({ calls, maxRunning, stopDuringStart }).toEqual({
      calls: 1,
      maxRunning: 1,
      stopDuringStart: false,
    });
  });
});

describe("runtime/LC-03", () => {
  it("shutdownTimeout: Infinity waits for stop() instead of aborting", async () => {
    let stopped = false;
    const manager = new LifecycleManager({
      handleSignals: false,
      shutdownTimeout: Infinity,
    });
    manager.register({
      name: "db",
      stop: async () => {
        await tick(30);
        stopped = true;
      },
    });

    await manager.start();
    await manager.shutdown();
    expect(stopped).toBe(true);
  });

  it("rejects a NaN shutdownTimeout", () => {
    expect(() => new LifecycleManager({ shutdownTimeout: Number.NaN })).toThrow(
      RangeError,
    );
  });
});

describe("runtime/LC-04", () => {
  it("installs signal listeners on start and removes them after shutdown", async () => {
    const before = process.listenerCount("SIGTERM");
    const manager = new LifecycleManager();
    expect(process.listenerCount("SIGTERM")).toBe(before);

    await manager.start();
    expect(process.listenerCount("SIGTERM")).toBe(before + 1);

    await manager.shutdown();
    expect(process.listenerCount("SIGTERM")).toBe(before);
  });

  it("exits on a second signal during shutdown", () => {
    const exit = vi.fn();
    const handler = vi.fn();
    const remove = installSignalHandlers({ signals: ["SIGUSR2"], handler, exit });

    process.emit("SIGUSR2", "SIGUSR2");
    process.emit("SIGUSR2", "SIGUSR2");
    remove();

    expect(handler).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(1);
  });
});
