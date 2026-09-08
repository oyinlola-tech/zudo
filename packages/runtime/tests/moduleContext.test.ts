import { describe, it, expect, vi } from "vitest";

import { createLogger } from "@zudojs/logger";
import { createConfigurationManager } from "@zudojs/core";
import type { Module, ModuleContext } from "@zudojs/core";

import { LifecycleManager } from "../src/lifecycle/index.js";

function capturingModule(
  id: string,
  captured: ModuleContext[],
  dependencies: string[] = [],
): Module {
  return {
    id,
    name: `Module ${id}`,
    dependencies,
    onInitialize: vi.fn((context: ModuleContext) => {
      captured.push(context);
      return Promise.resolve();
    }),
    onReady: vi.fn().mockResolvedValue(undefined),
    onShutdown: vi.fn().mockResolvedValue(undefined),
    onDestroy: vi.fn().mockResolvedValue(undefined),
  };
}

function managerFor(
  modules: Module[],
  services: ConstructorParameters<typeof LifecycleManager>[3] = {},
): LifecycleManager {
  const map = new Map<string, Module>();
  for (const module of modules) {
    map.set(module.id, module);
  }

  return new LifecycleManager(
    map,
    createLogger({ name: "test-lifecycle" }),
    {},
    services,
  );
}

describe("ModuleContext wiring", () => {
  it("exposes the module's own identity", async () => {
    const captured: ModuleContext[] = [];
    await managerFor([capturingModule("api", captured)]).initialize();

    expect(captured).toHaveLength(1);
    expect(captured[0]?.id).toBe("api");
    expect(captured[0]?.name).toBe("Module api");
    expect(captured[0]?.logger).toBeDefined();
  });

  it("hands the same context to every lifecycle phase", async () => {
    const captured: ModuleContext[] = [];
    const module = capturingModule("api", captured);
    const manager = managerFor([module]);

    await manager.initialize();
    await manager.initialize();

    expect(captured[0]).toBe(captured[1]);
  });

  it("reports registered modules through hasModule", async () => {
    const captured: ModuleContext[] = [];
    const manager = managerFor([
      capturingModule("db", captured),
      capturingModule("api", captured, ["db"]),
    ]);

    await manager.initialize();

    const context = captured[0];
    expect(context?.hasModule("db")).toBe(true);
    expect(context?.hasModule("api")).toBe(true);
    expect(context?.hasModule("nope")).toBe(false);
  });

  it("resolves a dependency's context through getModuleContext", async () => {
    const captured: ModuleContext[] = [];
    const manager = managerFor([
      capturingModule("db", captured),
      capturingModule("api", captured, ["db"]),
    ]);

    await manager.initialize();

    // "db" is initialized first, so its context exists by the time "api" runs.
    const apiContext = captured.find((context) => context.id === "api");
    expect(apiContext?.getModuleContext("db")?.id).toBe("db");
    expect(apiContext?.getModuleContext("missing")).toBeUndefined();
  });

  it("reads configuration through the supplied manager", async () => {
    const captured: ModuleContext[] = [];
    const configuration = createConfigurationManager({
      loaderOptions: {
        sources: [
          {
            name: "test",
            type: "custom",
            priority: 0,
            load: () =>
              Promise.resolve([{ path: "db.url", value: "postgres://x" }]),
          },
        ],
      },
    });

    await managerFor([capturingModule("api", captured)], {
      configuration,
    }).initialize();

    const context = captured[0];
    expect(context?.getConfig("db.url")).toBe("postgres://x");
    expect(context?.requireConfig("db.url")).toBe("postgres://x");
    expect(context?.getConfiguration()).toBeDefined();
    expect(context?.configuration).toBe(configuration);
  });

  it("throws a clear error for a required config value that is absent", async () => {
    const captured: ModuleContext[] = [];
    await managerFor([capturingModule("api", captured)]).initialize();

    expect(captured[0]?.getConfig("missing.key")).toBeUndefined();
    expect(() => captured[0]?.requireConfig("missing.key")).toThrow();
  });

  it("throws when a module reads application without one supplied", async () => {
    const captured: ModuleContext[] = [];
    await managerFor([capturingModule("api", captured)]).initialize();

    expect(() => captured[0]?.application).toThrow(
      /no ApplicationContext was supplied/,
    );
  });

  it("returns the supplied application context", async () => {
    const captured: ModuleContext[] = [];
    const application = {
      marker: true,
    } as unknown as ModuleContext["application"];

    await managerFor([capturingModule("api", captured)], {
      application,
    }).initialize();

    expect(captured[0]?.application).toBe(application);
  });
});
