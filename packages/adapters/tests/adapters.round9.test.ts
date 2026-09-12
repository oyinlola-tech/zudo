/**
 * @zudojs/adapters — Round 9 regression tests.
 *
 * One describe block per finding.
 */

import { describe, it, expect } from "vitest";

import { AdapterRegistry, createMockAdapter } from "../src/index.js";

/* ─── ADAPTERS-R9-01: a throwing stop() skipped dispose() entirely ──────── */

describe("ADAPTERS-R9-01", () => {
  it("disposeAll still disposes an adapter whose stop() threw", async () => {
    const calls: string[] = [];
    const registry = new AdapterRegistry();
    registry.register(
      createMockAdapter({
        name: "flaky",
        stop: async () => {
          calls.push("flaky.stop");
          throw new Error("stop failed");
        },
        dispose: async () => {
          calls.push("flaky.dispose");
        },
      }),
    );
    registry.register(
      createMockAdapter({
        name: "fine",
        stop: async () => {
          calls.push("fine.stop");
        },
        dispose: async () => {
          calls.push("fine.dispose");
        },
      }),
    );

    await expect(registry.disposeAll()).rejects.toBeInstanceOf(AggregateError);

    expect(calls).toEqual([
      "flaky.stop",
      "flaky.dispose",
      "fine.stop",
      "fine.dispose",
    ]);
    expect(registry.size).toBe(0);
  });

  it("removeAndDispose disposes after a failing stop() and reports the stop error", async () => {
    const calls: string[] = [];
    const registry = new AdapterRegistry();
    registry.register(
      createMockAdapter({
        name: "flaky",
        stop: async () => {
          calls.push("stop");
          throw new Error("stop failed");
        },
        dispose: async () => {
          calls.push("dispose");
        },
      }),
    );

    await expect(registry.removeAndDispose("flaky")).rejects.toThrow(
      /stop failed/,
    );
    expect(calls).toEqual(["stop", "dispose"]);
    expect(registry.has("flaky")).toBe(false);
  });

  it("reports both errors when stop() and dispose() fail", async () => {
    const registry = new AdapterRegistry();
    registry.register(
      createMockAdapter({
        name: "broken",
        stop: async () => {
          throw new Error("stop failed");
        },
        dispose: async () => {
          throw new Error("dispose failed");
        },
      }),
    );

    let caught: unknown;
    try {
      await registry.removeAndDispose("broken");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).errors.map((e) => (e as Error).message)).toEqual([
      "stop failed",
      "dispose failed",
    ]);
  });
});
