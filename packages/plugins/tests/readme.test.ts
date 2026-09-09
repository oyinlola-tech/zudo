import { describe, expect, it } from "vitest";
import {
  PluginManager,
  createPluginContext,
  PLUGIN_EVENTS,
  PluginDependencyVersionError,
} from "../src/index.js";

// Executes the README quick start and the option/event/version/diagnostic
// snippets verbatim, so a snippet that stops compiling or running fails CI.
describe("README", () => {
  it("quick start runs", async () => {
    const ended: string[] = [];
    const openPool = () => ({
      end: (): void => {
        ended.push("pool");
      },
    });
    const logged: string[] = [];

    const manager = new PluginManager({ hookTimeout: 5_000 });

    manager.register({
      metadata: { name: "@acme/db", version: "1.0.0" },
      async start(context) {
        const pool = openPool();
        context.registerDisposable({ dispose: () => pool.end() });
      },
    });

    manager.register({
      metadata: { name: "@acme/api" },
      dependencies: [{ name: "@acme/db", version: "^1.0.0" }],
      async start(context) {
        context.logger?.info("api started");
      },
    });

    const context = createPluginContext(
      { name: "@acme/host" },
      {
        logger: {
          info: (m: string) => logged.push(m),
          warn: () => {},
          error: () => {},
        },
      },
    );

    await manager.start(context);
    await manager.stop(context);

    expect(logged).toEqual(["api started"]);
    expect(ended).toEqual(["pool"]);
  });

  it("version snippet produces the documented message", async () => {
    const manager = new PluginManager();
    manager.register({ metadata: { name: "@acme/db", version: "1.4.0" } });
    manager.register({
      metadata: { name: "@acme/api" },
      dependencies: [{ name: "@acme/db", version: "^2.0.0" }],
    });

    await expect(
      manager.start(createPluginContext({ name: "@acme/host" })),
    ).rejects.toThrow(PluginDependencyVersionError);

    await expect(
      manager.start(createPluginContext({ name: "@acme/host" })),
    ).rejects.toThrow(
      'Plugin "@acme/api" requires "@acme/db@^2.0.0", but version 1.4.0 is registered.',
    );
  });

  it("manager options snippet is accepted", () => {
    const manager = new PluginManager({
      checkVersions: true,
      hookTimeout: 5_000,
      onError: () => {},
      allowedCapabilities: ["http", "db"],
      events: { on() {}, off() {}, emit() {} },
    });

    expect(manager.list()).toEqual([]);
  });

  it("events snippet observes plugin:registered", () => {
    const seen: unknown[] = [];
    const manager = new PluginManager({
      events: {
        on() {},
        off() {},
        emit(name, payload) {
          if (name === PLUGIN_EVENTS.REGISTERED) seen.push(payload);
        },
      },
    });

    manager.register({ metadata: { name: "@acme/db" } });
    expect(seen).toHaveLength(1);
  });

  it("diagnostics snippet reports the documented fields", async () => {
    const manager = new PluginManager();
    manager.register({
      metadata: { name: "@acme/db" },
      async start() {
        throw new Error("boom");
      },
    });

    await manager
      .start(createPluginContext({ name: "@acme/host" }))
      .catch(() => {});

    const report = manager.diagnostics();

    expect(report.total).toBe(1);
    expect(report.unhealthy).toBe(1);
    expect(report.plugins[0]?.state).toBe("disposed");
    expect(report.plugins[0]?.health.details).toBe("boom");
  });
});
