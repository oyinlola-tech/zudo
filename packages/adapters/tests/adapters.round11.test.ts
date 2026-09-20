/**
 * @zudojs/adapters — Audit round 11 regression tests.
 *
 * One describe block per finding.
 */

import { describe, it, expect, vi } from "vitest";
import { AdapterConfigurationError } from "@zudojs/errors";

import {
  AdapterRegistry,
  createHealthyHealth,
  createMockAdapter,
  createUnhealthyHealth,
} from "../src/index.js";
import { collectAdapterHealth } from "../src/adapter/adapter.health.js";

describe("TOOL-02 — an adapter named __proto__ cannot hide from healthAll()", () => {
  it("keeps the entry and reports the worst status", async () => {
    const health = vi.fn(() => createUnhealthyHealth("down"));
    const report = await collectAdapterHealth([
      ["__proto__", createMockAdapter({ name: "__proto__", health })],
      [
        "db",
        createMockAdapter({ name: "db", health: () => createHealthyHealth() }),
      ],
    ]);

    expect(health).toHaveBeenCalledTimes(1);
    expect(Object.keys(report.adapters)).toContain("__proto__");
    expect(report.adapters["__proto__"]?.status).toBe("unhealthy");
    expect(report.status).toBe("unhealthy");
  });

  it("does not poison the report's prototype", async () => {
    const report = await collectAdapterHealth([
      [
        "__proto__",
        createMockAdapter({
          name: "__proto__",
          health: () => createUnhealthyHealth("down"),
        }),
      ],
    ]);

    expect(Object.getPrototypeOf(report.adapters)).toBeNull();
    expect(({} as Record<string, unknown>)["status"]).toBeUndefined();
  });

  it("refuses to register a prototype-member name", () => {
    const registry = new AdapterRegistry();

    for (const name of [
      "__proto__",
      "constructor",
      "PROTOTYPE",
      " __proto__ ",
    ]) {
      expect(() => registry.register(createMockAdapter({ name }))).toThrow(
        AdapterConfigurationError,
      );
    }

    expect(registry.size).toBe(0);
    expect(() =>
      registry.register(createMockAdapter({ name: "safe" })),
    ).not.toThrow();
  });
});

describe("TOOL-06 — AdapterOperationOptions.retry is honoured", () => {
  it("retries an unhealthy check up to the attempt budget", async () => {
    const health = vi
      .fn()
      .mockReturnValueOnce(createUnhealthyHealth("first"))
      .mockReturnValueOnce(createUnhealthyHealth("second"))
      .mockReturnValueOnce(createHealthyHealth());

    const report = await collectAdapterHealth(
      [["db", createMockAdapter({ name: "db", health })]],
      { retry: { attempts: 3 } },
    );

    expect(health).toHaveBeenCalledTimes(3);
    expect(report.adapters["db"]?.status).toBe("healthy");
    expect(report.status).toBe("healthy");
  });

  it("runs once when no retry is configured", async () => {
    const health = vi.fn(() => createUnhealthyHealth("down"));

    await collectAdapterHealth([
      ["db", createMockAdapter({ name: "db", health })],
    ]);

    expect(health).toHaveBeenCalledTimes(1);
  });

  it("retries a check that throws", async () => {
    let calls = 0;
    const health = (): { status: "healthy"; timestamp: number } => {
      calls += 1;
      if (calls < 2) throw new Error("boom");
      return createHealthyHealth() as { status: "healthy"; timestamp: number };
    };

    const report = await collectAdapterHealth(
      [["db", createMockAdapter({ name: "db", health })]],
      { retry: { attempts: 2, delay: 1 } },
    );

    expect(calls).toBe(2);
    expect(report.adapters["db"]?.status).toBe("healthy");
  });

  it("stops retrying once a check reports healthy", async () => {
    const health = vi.fn(() => createHealthyHealth());

    await collectAdapterHealth(
      [["db", createMockAdapter({ name: "db", health })]],
      { retry: { attempts: 5 } },
    );

    expect(health).toHaveBeenCalledTimes(1);
  });

  it("stops retrying when the signal aborts", async () => {
    const controller = new AbortController();
    const health = vi.fn(() => {
      controller.abort();
      return createUnhealthyHealth("down");
    });

    const report = await collectAdapterHealth(
      [["db", createMockAdapter({ name: "db", health })]],
      { retry: { attempts: 4, delay: 50 }, signal: controller.signal },
    );

    expect(health).toHaveBeenCalledTimes(1);
    expect(report.adapters["db"]?.status).toBe("unhealthy");
  });

  it("treats a non-positive attempt count as a single attempt", async () => {
    const health = vi.fn(() => createUnhealthyHealth("down"));

    await collectAdapterHealth(
      [["db", createMockAdapter({ name: "db", health })]],
      { retry: { attempts: 0 } },
    );

    expect(health).toHaveBeenCalledTimes(1);
  });
});
