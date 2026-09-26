import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";

import { createApplication, defineModule } from "../src/index.js";
import type { Module, RuntimeSignalTarget } from "../src/index.js";

const quiet = {
  signals: {
    handleSigint: false,
    handleSigterm: false,
    handleUncaughtException: false,
    handleUnhandledRejection: false,
  },
  diagnostics: { startupLogging: false, shutdownLogging: false },
};

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function appWith(module: Partial<Module>, timeoutMs: number) {
  return createApplication({
    modules: [
      defineModule({
        id: "db",
        name: "db",
        factory: () => ({ id: "db", name: "db", ...module }) as Module,
      }),
    ],
    runtime: { ...quiet, startup: { timeoutMs } },
  } as never);
}

describe("runtime/CORE-02", () => {
  it("destroys a module whose onInitialize finishes after the startup timeout", async () => {
    const log: string[] = [];
    const app = await appWith(
      {
        onInitialize: async () => {
          await delay(120);
          log.push("init:end");
        },
        onReady: () => void log.push("onReady"),
        onShutdown: () => void log.push("onShutdown"),
        onDestroy: () => void log.push("onDestroy"),
      },
      30,
    );

    await expect(app.start()).rejects.toThrow();
    await app.stop();
    // Since round 12 stop() no longer waits behind the abandoned hook;
    // the late module is destroyed once its hook settles (at ~120 ms).
    await delay(150);

    expect(log).toEqual(["init:end", "onDestroy"]);
  });

  it("shuts down a module whose onReady finishes after the startup timeout", async () => {
    const log: string[] = [];
    const app = await appWith(
      {
        onReady: async () => {
          await delay(120);
          log.push("listening");
        },
        onShutdown: () => void log.push("onShutdown"),
        onDestroy: () => void log.push("onDestroy"),
      },
      30,
    );

    await expect(app.start()).rejects.toThrow();
    await app.stop();
    // Since round 12 stop() returns without waiting for the abandoned
    // onReady; the module is stopped and destroyed once it settles.
    await delay(150);

    expect(log).toEqual(["listening", "onShutdown", "onDestroy"]);
  });
});

describe("runtime/CORE-03", () => {
  async function crash(signals: Record<string, unknown>) {
    const target = new EventEmitter() as EventEmitter & { exit: unknown };
    const exit = vi.fn();
    target.exit = exit;
    const app = await createApplication({
      signalTarget: target as unknown as RuntimeSignalTarget,
      runtime: {
        diagnostics: quiet.diagnostics,
        signals: { handleSigint: false, handleSigterm: false, ...signals },
      },
    } as never);
    await app.start();
    target.emit("uncaughtException", new Error("boom"));
    await delay(50);
    return exit;
  }

  it("exits non-zero after an uncaught exception by default", async () => {
    expect(await crash({})).toHaveBeenCalledWith(1);
  });

  it("stays alive when exitOnFatalError is off", async () => {
    expect(await crash({ exitOnFatalError: false })).not.toHaveBeenCalled();
  });
});
