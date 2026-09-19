import { describe, it, expect } from "vitest";

import type { Module } from "@zudojs/core";
import { createLogger } from "@zudojs/logger";

import { LifecycleManager } from "../src/lifecycle/index.js";
import { createTestRuntime } from "../src/testRuntime/testRuntime.core.js";

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe("runtime/RT-01", () => {
  it("tears down a module that finishes initializing after the startup timeout", async () => {
    const log: string[] = [];
    const db = {
      id: "db",
      name: "db",
      onInitialize: async () => {
        await delay(120);
        log.push("init:end");
      },
      onReady: async () => void log.push("onReady"),
      onShutdown: async () => void log.push("onShutdown"),
      onDestroy: async () => void log.push("onDestroy"),
    } as Module;

    const rt = createTestRuntime([db], { startupTimeout: 30 });
    await expect(rt.start()).rejects.toThrow(/timed out/);
    await rt.stop();
    await delay(50);

    expect(log).toEqual(["init:end", "onDestroy"]);
    expect(rt.state).toBe("stopped");
  });

  it("shuts down and destroys a module whose onReady finishes after the timeout", async () => {
    const log: string[] = [];
    const web = {
      id: "web",
      name: "web",
      onReady: async () => {
        await delay(120);
        log.push("listening");
      },
      onShutdown: async () => void log.push("onShutdown"),
      onDestroy: async () => void log.push("onDestroy"),
    } as Module;

    const rt = createTestRuntime([web], { startupTimeout: 30 });
    await expect(rt.start()).rejects.toThrow(/timed out/);
    await rt.stop();

    expect(log).toEqual(["listening", "onShutdown", "onDestroy"]);
  });
});

describe("runtime/RT-02", () => {
  it("a second stop() joins the abandoned shutdown instead of re-running onShutdown", async () => {
    let calls = 0;
    const db = {
      id: "db",
      name: "db",
      onShutdown: async () => {
        calls += 1;
        await delay(150);
      },
    } as Module;

    const rt = createTestRuntime([db], { shutdownTimeout: 30 });
    await rt.start();
    await expect(rt.stop()).rejects.toThrow(/exceeded/);
    await expect(rt.stop()).rejects.toThrow(/exceeded/);
    await delay(150);

    expect(calls).toBe(1);
  });
});

describe("runtime/RT-03", () => {
  it("fails initialization when configuration cannot load", async () => {
    let initialized = false;
    const configuration = {
      isReady: () => false,
      initialize: async () => {
        throw new Error("missing DATABASE_URL");
      },
    } as never;
    const mod = {
      id: "m",
      name: "m",
      onInitialize: () => void (initialized = true),
    } as Module;

    const lifecycle = new LifecycleManager(
      new Map([["m", mod]]),
      createLogger({ name: "rt03" }),
      {},
      { configuration },
    );

    await expect(lifecycle.initialize()).rejects.toThrow(/Configuration failed/);
    expect(initialized).toBe(false);
  });
});

describe("runtime/RT-04", () => {
  it("releases signal handlers after a failed start", async () => {
    const before = process.listenerCount("SIGTERM");
    const bad = {
      id: "bad",
      name: "bad",
      onInitialize: () => {
        throw new Error("boom");
      },
    } as Module;

    const rt = createTestRuntime([bad], { handleSignals: true });
    await expect(rt.start()).rejects.toThrow();

    expect(process.listenerCount("SIGTERM")).toBe(before);
  });
});

describe("runtime/RT-05", () => {
  it("passes the fatal-error and second-signal options to the signal handler", () => {
    const rt = createTestRuntime([], {
      exitOnFatalError: false,
      forceExitOnSecondSignal: false,
      fatalExitTimeout: 250,
    });
    const handler = (
      rt as unknown as {
        signalHandler: { options: Record<string, unknown> };
      }
    ).signalHandler;

    expect(handler.options).toMatchObject({
      exitOnFatalError: false,
      forceExitOnSecondSignal: false,
      fatalExitTimeout: 250,
    });
  });

  it("rejects a non-finite fatalExitTimeout", () => {
    expect(() => createTestRuntime([], { fatalExitTimeout: Number.NaN })).toThrow(
      /Fatal exit timeout/,
    );
  });
});
