/**
 * Batch-7 (second report): runtime error classes that were exported but
 * never thrown, and the terminal-state model.
 */

import { describe, expect, it } from "vitest";
import type { Module } from "@zudojs/core";
import { createLogger } from "@zudojs/logger";
import type { Logger } from "@zudojs/logger";
import { createContainer } from "@zudojs/container";
import { createEventBus } from "@zudojs/events";

import {
  createRuntime,
  isTerminalState,
  RuntimeInitializationError,
  RuntimeRollbackError,
  RuntimeSignalError,
  RuntimeStartError,
  SignalHandler,
  TERMINAL_STATES,
} from "../src/index.js";

function build(modules: readonly Module[]) {
  return createRuntime(
    {
      modules: new Map(modules.map((module) => [module.id, module])),
      logger: createLogger({ name: "batch7-errors" }),
      container: createContainer(),
      eventBus: createEventBus(),
    },
    {
      environment: "test",
      applicationName: "batch7",
      handleSignals: false,
      handleFatalErrors: false,
    },
  );
}

async function startError(modules: readonly Module[]): Promise<unknown> {
  const runtime = build(modules);
  const error = await runtime.start().then(
    () => undefined,
    (caught: unknown) => caught,
  );
  await runtime.stop();
  return error;
}

describe("BATCH7-RUNTIME-9: exported error classes are thrown", () => {
  it("an onInitialize failure is a RuntimeInitializationError", async () => {
    const original = new Error("db down");
    const error = await startError([
      {
        id: "db",
        name: "Db",
        onInitialize: () => {
          throw original;
        },
      },
    ]);

    expect(error).toBeInstanceOf(RuntimeInitializationError);
    // Still a RuntimeStartError, so existing handlers keep matching.
    expect(error).toBeInstanceOf(RuntimeStartError);
    expect((error as RuntimeInitializationError).phase).toBe("initialize");
    expect((error as RuntimeInitializationError).failedModuleId).toBe("db");
    expect((error as RuntimeInitializationError).cause).toBe(original);
  });

  it("an onReady failure is a RuntimeStartError, not an initialization one", async () => {
    const error = await startError([
      {
        id: "api",
        name: "Api",
        onReady: () => {
          throw new Error("port in use");
        },
      },
    ]);

    expect(error).toBeInstanceOf(RuntimeStartError);
    expect(error).not.toBeInstanceOf(RuntimeInitializationError);
    expect((error as RuntimeStartError).phase).toBe("start");
  });

  it("a failed rollback is a RuntimeRollbackError keeping both errors", async () => {
    const startFailure = new Error("port in use");
    const rollbackFailure = new Error("cannot close pool");
    const error = await startError([
      {
        id: "db",
        name: "Db",
        onShutdown: () => {
          throw rollbackFailure;
        },
      },
      {
        id: "api",
        name: "Api",
        dependencies: ["db"],
        onReady: () => {
          throw startFailure;
        },
      },
    ]);

    expect(error).toBeInstanceOf(RuntimeRollbackError);
    expect(error).toBeInstanceOf(RuntimeStartError);
    const rollback = error as RuntimeRollbackError;
    expect(rollback.rollbackError).toBe(rollbackFailure);
    expect(rollback.originalError).toBeInstanceOf(RuntimeStartError);
    expect(rollback.cause).toBe(startFailure);
    expect(rollback.failedModuleId).toBe("api");
    expect(rollback.message).toMatch(/api/);
  });

  it("a failed signal-triggered shutdown is logged as a RuntimeSignalError", async () => {
    const logged: unknown[] = [];
    const logger = {
      info: () => undefined,
      warn: () => undefined,
      debug: () => undefined,
      error: (_message: string, context?: Record<string, unknown>) => {
        logged.push(context?.["error"]);
      },
    } as unknown as Logger;

    const handler = new SignalHandler(logger, {
      handleSignals: true,
      handleFatalErrors: false,
      exit: () => undefined,
      setExitCode: () => undefined,
    });
    const failure = new Error("stop failed");
    handler.register(async () => {
      throw failure;
    });

    try {
      process.emit("SIGTERM", "SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 10));
    } finally {
      handler.unregister();
    }

    const signalError = logged.find(
      (entry) => entry instanceof RuntimeSignalError,
    ) as RuntimeSignalError | undefined;
    expect(signalError).toBeDefined();
    expect(signalError!.signal).toBe("SIGTERM");
    expect(signalError!.cause).toBe(failure);
  });
});

describe("BATCH7-RUNTIME-10: failed is not terminal", () => {
  it("isTerminalState agrees with stop() being allowed from failed", async () => {
    expect(isTerminalState("failed")).toBe(false);
    expect(isTerminalState("stopped")).toBe(true);
    expect(TERMINAL_STATES).toEqual(["stopped"]);

    const runtime = build([
      {
        id: "bad",
        name: "Bad",
        onInitialize: () => {
          throw new Error("no");
        },
      },
    ]);
    await expect(runtime.start()).rejects.toThrow();
    expect(runtime.state).toBe("failed");
    expect(isTerminalState(runtime.state)).toBe(false);
    await runtime.stop();
    expect(isTerminalState(runtime.state)).toBe(true);
  });
});
