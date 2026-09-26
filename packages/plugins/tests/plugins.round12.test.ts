import { describe, it, expect, vi } from "vitest";

import {
  PluginManager,
  createPluginContext,
  PluginInitializationError,
  PluginStartError,
  PluginStopError,
  PluginTimeoutError,
  buildDiagnosticReport,
} from "../src/index.js";
import type { Plugin, PluginContainer, PluginContext } from "../src/index.js";

const host = (): PluginContext => createPluginContext({ name: "host-app", version: "2.0.0" });

const hang = (): Promise<void> => new Promise<void>(() => {});

describe("#104 hook timeout holds the event loop", () => {
  it("arms a ref'd timer so a hanging start() times out instead of exiting the process", async () => {
    const spy = vi.spyOn(globalThis, "setTimeout");
    try {
      const m = new PluginManager({ hookTimeout: 20 });
      m.register({ metadata: { name: "hang" }, start: hang });

      const pending = m.start(host());
      await new Promise((resolve) => setImmediate(resolve));

      const timers = spy.mock.results
        .map((result) => result.value as unknown)
        .filter(
          (timer): timer is { hasRef(): boolean } =>
            typeof timer === "object" && timer !== null && "hasRef" in timer,
        );
      expect(timers.length).toBeGreaterThan(0);
      expect(timers.every((timer) => timer.hasRef())).toBe(true);

      await expect(pending).rejects.toBeInstanceOf(PluginTimeoutError);
      const report = m.diagnostics().plugins[0]!;
      expect(report.failed).toBe(true);
      expect(report.state).toBe("disposed");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("#105 lifecycle failures name the plugin", () => {
  it("wraps a start() failure in PluginStartError with the cause", async () => {
    const boom = new Error("boom");
    const m = new PluginManager();
    m.register({
      metadata: { name: "@acme/api" },
      start() {
        throw boom;
      },
    });

    const error = await m.start(host()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PluginStartError);
    expect((error as PluginStartError).pluginName).toBe("@acme/api");
    expect((error as PluginStartError).cause).toBe(boom);
    expect((error as Error).message).toBe('Plugin "@acme/api" failed to start: boom');
    expect(m.diagnostics().plugins[0]!.health.details).toBe("boom");
  });

  it("wraps install() and initialize() failures in PluginInitializationError", async () => {
    const install = new PluginManager();
    install.register({
      metadata: { name: "a" },
      install() {
        throw new Error("no install");
      },
    });
    const installError = await install.start(host()).catch((e: unknown) => e);
    expect(installError).toBeInstanceOf(PluginInitializationError);
    expect((installError as Error).message).toBe('Plugin "a" failed to install: no install');

    const initialize = new PluginManager();
    initialize.register({
      metadata: { name: "b" },
      initialize: () => Promise.reject(new Error("no init")),
    });
    const error = await initialize.start(host()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PluginInitializationError);
    expect((error as Error).message).toBe('Plugin "b" failed to initialize: no init');
  });

  it("reports a stop() failure as PluginStopError through onError", async () => {
    const reported: unknown[] = [];
    const m = new PluginManager({ onError: (error) => reported.push(error) });
    m.register({
      metadata: { name: "c" },
      stop() {
        throw new Error("stuck");
      },
    });
    const context = host();
    await m.start(context);
    await m.stop(context);

    expect(reported).toHaveLength(1);
    expect(reported[0]).toBeInstanceOf(PluginStopError);
    expect((reported[0] as PluginStopError).pluginName).toBe("c");
    expect((reported[0] as Error).message).toBe('Plugin "c" failed to stop: stuck');
  });

  it("lets a typed plugin error through unchanged", async () => {
    const m = new PluginManager({ hookTimeout: 20 });
    m.register({ metadata: { name: "slow" }, start: hang });
    const error = await m.start(host()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PluginTimeoutError);
    expect(error).not.toBeInstanceOf(PluginStartError);
  });
});

describe("#106 registration, context and diagnostics ergonomics", () => {
  it("types register() options from Plugin<TOptions>", () => {
    let seen: number | undefined;
    const typed: Plugin<{ port: number }> = {
      metadata: { name: "typed" },
      install(_context, options) {
        seen = options.port;
      },
    };
    const m = new PluginManager();
    m.register(typed, { port: 8080 });

    const other: Plugin<{ port: number }> = { ...typed, metadata: { name: "other" } };
    // @ts-expect-error options must match the plugin's declared options type
    m.register(other, { port: "80" });

    expect(seen).toBeUndefined();
    expect(m.has("typed")).toBe(true);
  });

  it("exposes the host's metadata to every plugin", async () => {
    const hosts: string[] = [];
    const m = new PluginManager();
    m.register({
      metadata: { name: "p" },
      start(context) {
        hosts.push(`${context.host?.name}@${context.host?.version}`);
      },
    });
    await m.start(host());
    expect(hosts).toEqual(["host-app@2.0.0"]);
  });

  it("accepts a real container shape without casting and lets plugins resolve", async () => {
    interface Token<T> {
      readonly id: string;
      readonly _type?: T;
    }
    const values = new Map<string, unknown>();
    const container = {
      register<T>(token: Token<T>, provider: T): void {
        values.set(token.id, provider);
      },
      resolve<T>(token: Token<T>): T {
        return values.get(token.id) as T;
      },
      has(token: Token<unknown>): boolean {
        return values.has(token.id);
      },
    };
    const asPluginContainer: PluginContainer = container;
    const configToken: Token<{ url: string }> = { id: "config" };
    container.register(configToken, { url: "postgres://db" });

    let resolved: string | undefined;
    const m = new PluginManager();
    m.register({
      metadata: { name: "db" },
      start(context) {
        resolved = context.container?.resolve?.<{ url: string }>(configToken).url;
      },
    });
    await m.start(createPluginContext({ name: "host" }, { container: asPluginContainer }));
    expect(resolved).toBe("postgres://db");
  });

  it("reports cleanly stopped plugins as healthy and consults plugin health()", async () => {
    const m = new PluginManager();
    m.register({ metadata: { name: "a" } });
    m.register({
      metadata: { name: "b" },
      health: () => ({ status: "degraded", details: "queue lag" }),
    });
    m.register({
      metadata: { name: "c" },
      health() {
        throw new Error("probe failed");
      },
    });

    expect(m.diagnostics().healthy).toBe(3);

    const context = host();
    await m.start(context);
    const running = m.diagnostics();
    expect(running.plugins.map((p) => p.health.status)).toEqual([
      "healthy",
      "degraded",
      "unhealthy",
    ]);
    expect(running.plugins[2]!.health.details).toBe("probe failed");
    expect(running.failed).toBe(0);

    await m.stop(context);
    const stopped = m.diagnostics();
    expect(stopped.plugins.every((p) => p.state === "disposed")).toBe(true);
    expect(stopped.degraded).toBe(0);
    expect(stopped.healthy).toBe(3);
  });

  it("marks a plugin part-way through boot as degraded", () => {
    const report = buildDiagnosticReport([
      { plugin: { metadata: { name: "x" } }, state: "initialized" },
      { plugin: { metadata: { name: "y" } }, state: "stopped" },
    ]);
    expect(report.plugins.map((p) => p.health)).toEqual([
      { status: "degraded", details: { state: "initialized" } },
      { status: "healthy" },
    ]);
  });
});

describe("#104 follow-up: the grace wait after a timeout holds the event loop too", () => {
  it("a start() that never settles rejects with PluginTimeoutError instead of exiting with code 13", async () => {
    const { spawnSync } = await import("node:child_process");
    const { fileURLToPath } = await import("node:url");
    const script = fileURLToPath(new URL("./fixtures/hangingStart.script.mjs", import.meta.url));
    const run = spawnSync(process.execPath, [script], { encoding: "utf8", timeout: 20_000 });
    expect(run.status).toBe(0);
    expect(run.stdout.trim()).toBe("PluginTimeoutError");
  });
});
