import { describe, expect, it } from "vitest";

import {
  PluginManager,
  PluginRegistryImpl,
  DependencyResolver,
  LifecycleController,
  createPluginContext,
  isValidTransition,
  VALID_STATE_TRANSITIONS,
  PluginAlreadyRegisteredError,
  PluginDependencyError,
  PluginDependencyCycleError,
  PluginStateError,
  assertResolutionValid,
  PLUGIN_EVENTS,
  createPluginLifecycleEvent,
  createHealthyHealth,
  createDegradedHealth,
  createUnhealthyHealth,
  buildDiagnosticReport,
} from "../src/index.js";
import { parseVersion, compareVersions } from "../src/index.js";
import type {
  PluginState,
  SemVer,
  PluginLifecycleEvent,
} from "../src/index.js";

describe("isValidTransition", () => {
  it("allows registered -> installing", () => {
    expect(isValidTransition("registered", "installing")).toBe(true);
  });

  it("allows installed -> initializing", () => {
    expect(isValidTransition("installed", "initializing")).toBe(true);
  });

  it("allows started -> stopping", () => {
    expect(isValidTransition("started", "stopping")).toBe(true);
  });

  it("rejects registered -> started", () => {
    expect(isValidTransition("registered", "started")).toBe(false);
  });

  it("rejects started -> installed", () => {
    expect(isValidTransition("started", "installed")).toBe(false);
  });
});

describe("VALID_STATE_TRANSITIONS", () => {
  it("contains all states", () => {
    const states: PluginState[] = [
      "registered",
      "installing",
      "installed",
      "initializing",
      "initialized",
      "starting",
      "started",
      "stopping",
      "stopped",
      "disposing",
      "disposed",
      "failed",
    ];

    for (const state of states) {
      expect(VALID_STATE_TRANSITIONS[state]).toBeDefined();
    }
  });

  it("has empty transitions for disposed", () => {
    expect(VALID_STATE_TRANSITIONS.disposed).toEqual([]);
  });

  it("allows failed -> disposing", () => {
    expect(VALID_STATE_TRANSITIONS.failed).toContain("disposing");
  });
});

describe("DependencyResolver", () => {
  it("resolves simple dependencies", () => {
    const resolver = new DependencyResolver();
    const plugins = new Map([
      ["A", { dependencies: [{ name: "B" }] }],
      ["B", { dependencies: [] }],
    ]);

    const result = resolver.resolve(plugins);
    expect(result.ordered).toEqual(["B", "A"]);
    expect(result.missing).toEqual([]);
    expect(result.cycles).toEqual([]);
  });

  it("resolves complex dependency graph", () => {
    const resolver = new DependencyResolver();
    const plugins = new Map([
      ["A", { dependencies: [{ name: "B" }, { name: "C" }] }],
      ["B", { dependencies: [{ name: "D" }] }],
      ["C", { dependencies: [{ name: "D" }] }],
      ["D", { dependencies: [] }],
    ]);

    const result = resolver.resolve(plugins);
    expect(result.ordered).toEqual(["D", "B", "C", "A"]);
  });

  it("detects missing dependencies", () => {
    const resolver = new DependencyResolver();
    const plugins = new Map([["A", { dependencies: [{ name: "B" }] }]]);

    const result = resolver.resolve(plugins);
    expect(result.missing).toEqual(["B"]);
    expect(result.cycles).toEqual([]);
  });

  it("detects circular dependencies", () => {
    const resolver = new DependencyResolver();
    const plugins = new Map([
      ["A", { dependencies: [{ name: "B" }] }],
      ["B", { dependencies: [{ name: "A" }] }],
    ]);

    const result = resolver.resolve(plugins);
    expect(result.cycles.length).toBeGreaterThan(0);
  });

  it("throws on missing dependency", () => {
    const resolver = new DependencyResolver();
    const plugins = new Map([["A", { dependencies: [{ name: "B" }] }]]);

    const result = resolver.resolve(plugins);
    expect(() => {
      assertResolutionValid(result);
    }).toThrow(PluginDependencyError);
  });

  it("throws on circular dependency", () => {
    const resolver = new DependencyResolver();
    const plugins = new Map([
      ["A", { dependencies: [{ name: "B" }] }],
      ["B", { dependencies: [{ name: "A" }] }],
    ]);

    const result = resolver.resolve(plugins);
    expect(() => {
      assertResolutionValid(result);
    }).toThrow(PluginDependencyCycleError);
  });
});

describe("PluginRegistryImpl", () => {
  it("registers and retrieves plugins", () => {
    const registry = new PluginRegistryImpl();
    const plugin = {
      metadata: { name: "@zudojs/test" },
    };

    registry.register(plugin);
    expect(registry.has("@zudojs/test")).toBe(true);
    expect(registry.get("@zudojs/test")?.plugin).toBe(plugin);
  });

  it("rejects duplicate registration", () => {
    const registry = new PluginRegistryImpl();
    const plugin = {
      metadata: { name: "@zudojs/test" },
    };

    registry.register(plugin);
    expect(() => registry.register(plugin)).toThrow(
      PluginAlreadyRegisteredError,
    );
  });

  it("lists all plugins", () => {
    const registry = new PluginRegistryImpl();
    registry.register({ metadata: { name: "A" } });
    registry.register({ metadata: { name: "B" } });

    const list = registry.list();
    expect(list).toHaveLength(2);
  });

  it("removes registered plugins", () => {
    const registry = new PluginRegistryImpl();
    registry.register({ metadata: { name: "@zudojs/test" } });

    expect(registry.remove("@zudojs/test")).toBe(true);
    expect(registry.has("@zudojs/test")).toBe(false);
  });
});

describe("LifecycleController", () => {
  it("transitions through install lifecycle", async () => {
    const controller = new LifecycleController();
    const registry = new PluginRegistryImpl();
    const plugin = {
      metadata: { name: "@zudojs/test" },
      install() {},
    };
    registry.register(plugin);
    const registered = registry.get("@zudojs/test")!;
    const context = createPluginContext(plugin.metadata);

    await controller.install(registered, context);
    expect(registered.state).toBe("installed");
  });

  it("transitions to failed on install error", async () => {
    const controller = new LifecycleController();
    const registry = new PluginRegistryImpl();
    const plugin = {
      metadata: { name: "@zudojs/test" },
      install() {
        throw new Error("install failed");
      },
    };
    registry.register(plugin);
    const registered = registry.get("@zudojs/test")!;
    const context = createPluginContext(plugin.metadata);

    await expect(controller.install(registered, context)).rejects.toThrow(
      "install failed",
    );
    expect(registered.state).toBe("failed");
  });

  it("rejects invalid state transitions", async () => {
    const controller = new LifecycleController();
    const registry = new PluginRegistryImpl();
    const plugin = {
      metadata: { name: "@zudojs/test" },
    };
    registry.register(plugin);
    const registered = registry.get("@zudojs/test")!;
    const context = createPluginContext(plugin.metadata);

    await expect(controller.start(registered, context)).rejects.toThrow(
      PluginStateError,
    );
  });
});

describe("PluginManager", () => {
  it("registers and lists plugins", async () => {
    const manager = new PluginManager();
    manager.register({
      metadata: { name: "@zudojs/test" },
    });

    expect(manager.has("@zudojs/test")).toBe(true);
    expect(manager.list()).toHaveLength(1);
  });

  it("resolves dependencies and starts plugins in order", async () => {
    const manager = new PluginManager();
    const order: string[] = [];

    manager.register({
      metadata: { name: "@zudojs/a" },
      dependencies: [{ name: "@zudojs/b" }],
      async initialize() {
        order.push("a");
      },
      async start() {
        order.push("a-start");
      },
    });

    manager.register({
      metadata: { name: "@zudojs/b" },
      async initialize() {
        order.push("b");
      },
      async start() {
        order.push("b-start");
      },
    });

    const context = createPluginContext({ name: "@zudojs/test" });
    await manager.start(context);

    expect(order).toEqual(["b", "a", "b-start", "a-start"]);
  });

  it("rejects duplicate plugin registration", () => {
    const manager = new PluginManager();
    manager.register({
      metadata: { name: "@zudojs/test" },
    });

    expect(() => {
      manager.register({
        metadata: { name: "@zudojs/test" },
      });
    }).toThrow(PluginAlreadyRegisteredError);

    // The first registration must survive the rejected duplicate rather
    // than being overwritten by it.
    expect(manager.list()).toHaveLength(1);
  });
});

describe("PluginContext", () => {
  it("creates context with plugin metadata", () => {
    const context = createPluginContext({ name: "@zudojs/test" });
    expect(context.plugin.name).toBe("@zudojs/test");
    expect(context.signal).toBeInstanceOf(AbortSignal);
  });

  it("supports onDispose handler", async () => {
    const context = createPluginContext({ name: "@zudojs/test" });
    let disposed = false;

    context.onDispose(() => {
      disposed = true;
    });

    expect(disposed).toBe(false);
  });

  it("supports registerDisposable", () => {
    const context = createPluginContext({ name: "@zudojs/test" });
    const disposable = {
      dispose() {
        return undefined;
      },
    };

    expect(() => context.registerDisposable(disposable)).not.toThrow();
  });

  it("creates context with optional integrations", () => {
    const logger = {
      info: () => {},
      warn: () => {},
      error: () => {},
    };

    const context = createPluginContext(
      { name: "@zudojs/test" },
      {
        logger,
      },
    );

    expect(context.logger).toBe(logger);
  });
});

describe("PluginEvents", () => {
  it("creates plugin lifecycle event", () => {
    const event = createPluginLifecycleEvent(
      { name: "@zudojs/test" },
      "installed",
      "installing",
    );

    expect(event.plugin.name).toBe("@zudojs/test");
    expect(event.state).toBe("installed");
    expect(event.previousState).toBe("installing");
    expect(event.timestamp).toBeGreaterThan(0);
  });

  it("creates event without previous state", () => {
    const event = createPluginLifecycleEvent(
      { name: "@zudojs/test" },
      "failed",
    );

    expect(event.state).toBe("failed");
    expect(event.previousState).toBeUndefined();
  });

  it("creates event with error", () => {
    const error = new Error("test error");
    const event = createPluginLifecycleEvent(
      { name: "@zudojs/test" },
      "failed",
      "starting",
      error,
    );

    expect(event.error).toBe(error);
  });
});

describe("PluginDiagnostics", () => {
  it("creates healthy health", () => {
    const health = createHealthyHealth();
    expect(health.status).toBe("healthy");
  });

  it("creates degraded health", () => {
    const health = createDegradedHealth({ reason: "not started" });
    expect(health.status).toBe("degraded");
    expect(health.details).toEqual({ reason: "not started" });
  });

  it("creates unhealthy health", () => {
    const health = createUnhealthyHealth({ reason: "connection lost" });
    expect(health.status).toBe("unhealthy");
    expect(health.details).toEqual({ reason: "connection lost" });
  });

  it("builds diagnostic report", () => {
    const report = buildDiagnosticReport([
      {
        plugin: { metadata: { name: "@zudojs/a" } },
        state: "started" as const,
      },
      {
        plugin: { metadata: { name: "@zudojs/b" } },
        state: "failed" as const,
      },
    ]);

    expect(report.total).toBe(2);
    expect(report.healthy).toBe(1);
    expect(report.unhealthy).toBe(1);
    expect(report.failed).toBe(1);
    expect(report.plugins).toHaveLength(2);
  });

  it("includes dependencies in diagnostic", () => {
    const report = buildDiagnosticReport([
      {
        plugin: {
          metadata: { name: "@zudojs/a" },
          dependencies: [{ name: "@zudojs/b" }],
          optionalDependencies: [{ name: "@zudojs/c" }],
        },
        state: "started" as const,
      },
    ]);

    const diagnostic = report.plugins[0]!;
    expect(diagnostic.dependencies).toEqual(["@zudojs/b"]);
    expect(diagnostic.optionalDependencies).toEqual(["@zudojs/c"]);
  });
});

describe("PluginManager.diagnostics", () => {
  it("returns diagnostic report", async () => {
    const manager = new PluginManager();
    manager.register({
      metadata: { name: "@zudojs/a" },
    });
    manager.register({
      metadata: { name: "@zudojs/b" },
      dependencies: [{ name: "@zudojs/a" }],
    });

    const context = createPluginContext({ name: "@zudojs/test" });
    await manager.start(context);

    const report = manager.diagnostics();

    expect(report.total).toBe(2);
    expect(report.healthy).toBe(2);
  });

  it("reflects failed state in diagnostics", async () => {
    const manager = new PluginManager();
    manager.register({
      metadata: { name: "@zudojs/a" },
      async install() {
        throw new Error("failed");
      },
    });

    const context = createPluginContext({ name: "@zudojs/test" });
    await manager.start(context).catch(() => {});

    const report = manager.diagnostics();
    expect(report.failed).toBe(1);
  });
});

/* ─── Audit round 9: capabilities that were declared but never wired ─────── */

describe("plugin:registered (round 9)", () => {
  it("emits PLUGIN_EVENTS.REGISTERED through the manager's event sink", () => {
    const seen: Array<{ event: string; payload: unknown }> = [];

    const manager = new PluginManager({
      events: {
        on() {},
        off() {},
        emit(event, payload) {
          seen.push({ event, payload });
        },
      },
    });

    manager.register({ metadata: { name: "@zudojs/a", version: "1.2.3" } });

    expect(seen).toHaveLength(1);
    expect(seen[0]?.event).toBe(PLUGIN_EVENTS.REGISTERED);

    const payload = seen[0]?.payload as PluginLifecycleEvent;
    expect(payload.plugin.name).toBe("@zudojs/a");
    expect(payload.plugin.version).toBe("1.2.3");
    expect(payload.state).toBe("registered");
    expect(typeof payload.timestamp).toBe("number");
  });

  it("does not emit when registration is rejected", () => {
    const seen: string[] = [];
    const manager = new PluginManager({
      allowedCapabilities: [],
      events: {
        on() {},
        off() {},
        emit(event) {
          seen.push(event);
        },
      },
    });

    expect(() =>
      manager.register({
        metadata: { name: "@zudojs/a", capabilities: ["fs"] },
      }),
    ).toThrow(/not granted/);

    expect(seen).toEqual([]);
  });

  it("a throwing listener does not fail the registration", () => {
    const errors: string[] = [];
    const manager = new PluginManager({
      onError: (_error, name) => errors.push(name),
      events: {
        on() {},
        off() {},
        emit() {
          throw new Error("listener exploded");
        },
      },
    });

    expect(() =>
      manager.register({ metadata: { name: "@zudojs/a" } }),
    ).not.toThrow();

    expect(manager.has("@zudojs/a")).toBe(true);
    expect(errors).toEqual(["@zudojs/a"]);
  });
});

describe("plugin context identity (round 9)", () => {
  it("gives each plugin a context naming that plugin, not the host", async () => {
    const seen: string[] = [];

    const manager = new PluginManager();

    manager.register({
      metadata: { name: "@zudojs/a" },
      async start(context) {
        seen.push(context.plugin.name);
      },
    });

    manager.register({
      metadata: { name: "@zudojs/b" },
      async start(context) {
        seen.push(context.plugin.name);
      },
    });

    await manager.start(createPluginContext({ name: "@zudojs/host" }));

    expect(seen.sort()).toEqual(["@zudojs/a", "@zudojs/b"]);
  });

  it("createPluginContext takes the metadata itself, not a wrapper", () => {
    const context = createPluginContext({ name: "@zudojs/a", version: "1.0.0" });

    expect(context.plugin.name).toBe("@zudojs/a");
    expect(context.plugin.version).toBe("1.0.0");
  });
});

describe("SemVer is nameable by consumers (round 9)", () => {
  it("parseVersion's result can be passed straight to compareVersions", () => {
    const a: SemVer | undefined = parseVersion("1.2.3");
    const b: SemVer | undefined = parseVersion("1.10.0");

    if (a === undefined || b === undefined) {
      throw new Error("parseVersion rejected a valid semantic version.");
    }

    expect(compareVersions(a, b)).toBeLessThan(0);
    expect(compareVersions(a, a)).toBe(0);
  });
});

describe("isValidTransition governs the lifecycle (round 9)", () => {
  it("the controller rejects exactly what isValidTransition rejects", async () => {
    const registry = new PluginRegistryImpl();
    const controller = new LifecycleController();

    registry.register({ metadata: { name: "@zudojs/a" } });
    const registered = registry.get("@zudojs/a");

    if (!registered) {
      throw new Error("register() did not store the plugin.");
    }

    expect(isValidTransition("registered", "starting")).toBe(false);

    await expect(
      controller.start(registered, createPluginContext({ name: "@zudojs/a" })),
    ).rejects.toThrow(PluginStateError);

    // And it permits exactly what the predicate permits.
    expect(isValidTransition("registered", "installing")).toBe(true);
    await controller.install(
      registered,
      createPluginContext({ name: "@zudojs/a" }),
    );
    expect(registered.state).toBe("installed");
  });
});
