/**
 * Regression coverage for the round-8 audit findings (ADAPT-xx).
 */

import { describe, it, expect } from "vitest";

import {
  AdapterRegistry,
  createMockAdapter,
  createMockAdapterRegistry,
  AdapterCapabilityMissingError,
  AdapterConfigurationError,
  AdapterNotFoundError,
} from "../src/index.js";
import type { Adapter } from "../src/index.js";

// ─── ADAPT-01 · Names that cannot be looked up are rejected ────────────────

describe("registration names", () => {
  it("rejects a blank adapter name (ADAPT-01)", () => {
    const registry = new AdapterRegistry();
    expect(() => registry.register(createMockAdapter({ name: "" }))).toThrow(
      AdapterConfigurationError,
    );
    expect(() => registry.register(createMockAdapter({ name: "   " }))).toThrow(
      AdapterConfigurationError,
    );
    expect(registry.size).toBe(0);
  });

  it("matches names case-insensitively, both ways (ADAPT-01)", () => {
    const registry = new AdapterRegistry();
    const adapter = createMockAdapter({ name: "  Postgres " });
    registry.register(adapter);

    expect(registry.get("postgres")).toBe(adapter);
    expect(registry.get("POSTGRES")).toBe(adapter);
    expect(registry.has(" postgres  ")).toBe(true);
    expect(registry.getNames()).toEqual(["postgres"]);
    // The adapter object itself is untouched, which is what the class doc
    // now says.
    expect(registry.getAll()[0]?.name).toBe("  Postgres ");
    expect(() =>
      registry.register(createMockAdapter({ name: "POSTGRES" })),
    ).toThrow();
  });
});

// ─── ADAPT-02 · Capabilities are answerable ────────────────────────────────

describe("capability selection", () => {
  const http = createMockAdapter({
    name: "http-server",
    capabilities: { http: true, streaming: true },
  });
  const queue = createMockAdapter({
    name: "queue",
    capabilities: { backgroundTasks: true },
  });

  const populated = (): AdapterRegistry => {
    const registry = new AdapterRegistry();
    registry.register(http);
    registry.register(queue);
    return registry;
  };

  it("finds adapters by declared capability (ADAPT-02)", () => {
    const registry = populated();
    expect(registry.findByCapability("http")).toEqual([http]);
    expect(registry.findByCapability("backgroundTasks")).toEqual([queue]);
    expect(registry.findByCapability("udp")).toEqual([]);
  });

  it("answers `supports` without throwing for a missing adapter (ADAPT-02)", () => {
    const registry = populated();
    expect(registry.supports("http-server", "streaming")).toBe(true);
    expect(registry.supports("http-server", "udp")).toBe(false);
    expect(registry.supports("nope", "http")).toBe(false);
  });

  it("throws AdapterCapabilityMissingError when a capability is required (ADAPT-02)", () => {
    const registry = populated();
    expect(registry.requireCapability("http-server", "http")).toBe(http);
    expect(() => registry.requireCapability("queue", "http")).toThrow(
      AdapterCapabilityMissingError,
    );
    expect(() => registry.requireCapability("missing", "http")).toThrow(
      AdapterNotFoundError,
    );
  });
});

// ─── ADAPT-03 · The bring-up half of the lifecycle ─────────────────────────

describe("lifecycle", () => {
  function tracked(name: string, calls: string[]): Adapter {
    return createMockAdapter({
      name,
      initialize: () => {
        calls.push(`${name}:initialize`);
      },
      start: () => {
        calls.push(`${name}:start`);
      },
      stop: () => {
        calls.push(`${name}:stop`);
      },
      dispose: () => {
        calls.push(`${name}:dispose`);
      },
    });
  }

  it("initializes and starts every adapter (ADAPT-03)", async () => {
    const calls: string[] = [];
    const registry = new AdapterRegistry();
    registry.register(tracked("a", calls));
    registry.register(tracked("b", calls));

    await registry.initializeAll();
    await registry.startAll();
    await registry.stopAll();

    expect(calls).toEqual([
      "a:initialize",
      "b:initialize",
      "a:start",
      "b:start",
      "a:stop",
      "b:stop",
    ]);
    // stopAll leaves them registered; only disposeAll clears.
    expect(registry.size).toBe(2);
  });

  it("attempts every adapter and aggregates failures (ADAPT-03)", async () => {
    const calls: string[] = [];
    const registry = new AdapterRegistry();
    registry.register(
      createMockAdapter({
        name: "broken",
        initialize: () => {
          throw new Error("cannot initialize");
        },
      }),
    );
    registry.register(tracked("healthy", calls));

    await expect(registry.initializeAll()).rejects.toThrow(AggregateError);
    // The failure did not stop the second adapter from being tried.
    expect(calls).toEqual(["healthy:initialize"]);
  });

  it("skips adapters that declare no hooks (ADAPT-03)", async () => {
    const registry = new AdapterRegistry();
    registry.register(createMockAdapter({ name: "inert" }));
    await expect(registry.initializeAll()).resolves.toBeUndefined();
    await expect(registry.startAll()).resolves.toBeUndefined();
  });
});

// ─── ADAPT-04 · The mock registry helper actually works ────────────────────

describe("createMockAdapterRegistry", () => {
  it("returns a registry pre-populated with the adapters (ADAPT-04)", () => {
    const first = createMockAdapter({ name: "first" });
    const second = createMockAdapter({ name: "second" });
    const { registry, adapters } = createMockAdapterRegistry([first, second]);

    expect(adapters).toEqual([first, second]);
    expect(registry.size).toBe(2);
    expect(registry.get("first")).toBe(first);
    expect(registry.getNames()).toEqual(["first", "second"]);
  });

  it("defaults to an empty registry (ADAPT-04)", () => {
    const { registry, adapters } = createMockAdapterRegistry();
    expect(registry.size).toBe(0);
    expect(adapters).toEqual([]);
  });
});

// ─── ADAPT-05 · The README quick start ─────────────────────────────────────

describe("README quick start", () => {
  it("registers and looks up an adapter as documented (ADAPT-05)", () => {
    const registry = new AdapterRegistry();

    const postgres: Adapter = {
      name: "postgres",
      version: "1.0.0",
      capabilities: { longRunning: true },
      initialize: async () => {},
      dispose: async () => {},
    };

    registry.register(postgres);

    expect(registry.require("postgres")).toBe(postgres);
    expect(registry.findByCapability("longRunning")).toEqual([postgres]);
  });
});
