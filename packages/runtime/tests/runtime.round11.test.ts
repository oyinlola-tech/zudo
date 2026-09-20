/**
 * @zudojs/runtime — Round 11 regression tests.
 *
 * One describe block per finding id.
 */

import { describe, it, expect } from "vitest";
import { RuntimeError } from "@zudojs/errors";
import { createLogger } from "@zudojs/logger";
import type { Module } from "@zudojs/core";

import { LifecycleManager } from "../src/lifecycle/index.js";
import { RuntimeRegistry } from "../src/registry/index.js";
import { validateRuntimeOptions } from "../src/runtimeOptions/index.js";
import type { ResolvedRuntimeOptions } from "../src/runtimeOptions/index.js";

const silentLogger = createLogger({ level: "silent", transports: [] });

describe("CORE-03", () => {
  it("does not initialize or ready a module whose dependency failed", async () => {
    const log: string[] = [];

    const db: Module = {
      id: "db",
      name: "db",
      version: "1.0.0",
      onInitialize: async () => {
        log.push("db.init");
        throw new Error("db unavailable");
      },
    };

    const api: Module = {
      id: "api",
      name: "api",
      version: "1.0.0",
      dependencies: ["db"],
      onInitialize: async () => {
        log.push("api.init");
      },
      onReady: async () => {
        log.push("api.ready");
      },
    };

    const manager = new LifecycleManager(
      new Map([
        ["db", db],
        ["api", api],
      ]),
      silentLogger,
      { continueOnFailure: true },
    );

    const initResult = await manager.initialize();
    const startResult = await manager.start();

    expect(log).toEqual(["db.init"]);
    expect(initResult.succeeded).not.toContain("api");
    expect(initResult.failed.map((f) => f.moduleId).sort()).toEqual([
      "api",
      "db",
    ]);
    expect(startResult.succeeded).not.toContain("api");
    expect(manager.getInitializedModules()).not.toContain("api");
  });

  it("cascades the skip to transitive dependents", async () => {
    const log: string[] = [];

    const make = (
      id: string,
      dependencies: readonly string[],
      fail = false,
    ): Module => ({
      id,
      name: id,
      version: "1.0.0",
      dependencies: [...dependencies],
      onInitialize: async () => {
        log.push(id);
        if (fail) throw new Error(`${id} failed`);
      },
    });

    const manager = new LifecycleManager(
      new Map<string, Module>([
        ["a", make("a", [], true)],
        ["b", make("b", ["a"])],
        ["c", make("c", ["b"])],
        ["d", make("d", [])],
      ]),
      silentLogger,
      { continueOnFailure: true },
    );

    const result = await manager.initialize();

    expect(log).toEqual(["a", "d"]);
    expect([...result.succeeded]).toEqual(["d"]);
    expect(result.failed.map((f) => f.moduleId).sort()).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("still initializes independent modules after a failure", async () => {
    const log: string[] = [];

    const make = (id: string, fail = false): Module => ({
      id,
      name: id,
      version: "1.0.0",
      onInitialize: async () => {
        log.push(id);
        if (fail) throw new Error(`${id} failed`);
      },
    });

    const manager = new LifecycleManager(
      new Map<string, Module>([
        ["a", make("a", true)],
        ["b", make("b")],
      ]),
      silentLogger,
      { continueOnFailure: true },
    );

    const result = await manager.initialize();

    expect(log).toEqual(["a", "b"]);
    expect([...result.succeeded]).toEqual(["b"]);
  });
});

describe("CORE-05", () => {
  it("throws typed runtime errors from option validation", () => {
    const base = {
      environment: "test",
      applicationName: "app",
      shutdownTimeout: 100,
      startupTimeout: 100,
      fatalExitTimeout: 10,
      readinessCheckTimeout: 10,
    } as unknown as ResolvedRuntimeOptions;

    const invalid: readonly Partial<Record<string, unknown>>[] = [
      { environment: "" },
      { applicationName: "" },
      { shutdownTimeout: 0 },
      { startupTimeout: 0 },
      { fatalExitTimeout: Number.NaN },
      { readinessCheckTimeout: -1 },
    ];

    for (const patch of invalid) {
      expect(() =>
        validateRuntimeOptions({
          ...base,
          ...patch,
        } as ResolvedRuntimeOptions),
      ).toThrow(RuntimeError);
    }
  });

  it("throws typed runtime errors from the runtime registry", () => {
    const registry = new RuntimeRegistry();
    const fake = { id: "api" } as never;

    registry.register("api", fake);

    expect(() => registry.register("api", fake)).toThrow(RuntimeError);
    expect(() => registry.require("missing")).toThrow(RuntimeError);
  });
});
