/**
 * @zudojs/adapters — Audit round 10 regression tests.
 *
 * One describe block per finding. Every test here failed against the
 * pre-fix source.
 */

import { describe, it, expect, vi } from "vitest";
import { AdapterConfigurationError } from "@zudojs/errors";

import {
  AdapterRegistry,
  createDegradedHealth,
  createHealthyHealth,
  createMockAdapter,
} from "../src/index.js";

describe("tooling/ADP-01", () => {
  it("aggregates health from adapters that implement health()", async () => {
    const registry = new AdapterRegistry();
    registry.register(
      createMockAdapter({ name: "Db", health: () => createHealthyHealth() }),
    );
    registry.register(
      createMockAdapter({
        name: "cache",
        health: async () => createDegradedHealth("slow"),
      }),
    );
    registry.register(createMockAdapter({ name: "plain" }));

    const report = await registry.healthAll();
    expect(report.status).toBe("degraded");
    expect(Object.keys(report.adapters).sort()).toEqual(["cache", "db"]);
  });

  it("reports a throwing or slow check as unhealthy instead of throwing", async () => {
    const registry = new AdapterRegistry();
    registry.register(
      createMockAdapter({
        name: "boom",
        health: () => {
          throw new Error("down");
        },
      }),
    );
    registry.register(
      createMockAdapter({ name: "slow", health: () => new Promise(() => {}) }),
    );

    const report = await registry.healthAll({ timeout: 20 });
    expect(report.status).toBe("unhealthy");
    expect(report.adapters.boom?.message).toBe("down");
    expect(report.adapters.slow?.message).toMatch(/timed out/);
  });

  it("forwards configure() and rejects adapters without it", async () => {
    const configure = vi.fn();
    const registry = new AdapterRegistry();
    registry.register(createMockAdapter({ name: "cfg", configure }));
    registry.register(createMockAdapter({ name: "bare" }));

    await registry.configure("CFG", { port: 1 });
    expect(configure).toHaveBeenCalledWith({ port: 1 });
    await expect(registry.configure("bare", {})).rejects.toBeInstanceOf(
      AdapterConfigurationError,
    );
  });

  it("createMockAdapter keeps health and configure", () => {
    const health = () => createHealthyHealth();
    const adapter = createMockAdapter({ name: "m", health });
    expect(adapter.health).toBe(health);
  });
});
