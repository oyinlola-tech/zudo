/**
 * @zudojs/events — Round 10 regression tests.
 */

import { describe, it, expect, vi } from "vitest";

import {
  createEventBus,
  createEventRegistry,
  createFrozenEventSnapshot,
} from "../src/index.js";

describe("EVT-01", () => {
  it("does not freeze the publisher's own objects", async () => {
    const bus = createEventBus();
    bus.on("cart.updated", () => {});
    const cart = { total: 10, owner: { name: "a" } };
    await bus.publishEvent({ type: "cart.updated", payload: { cart } });
    expect(Object.isFrozen(cart)).toBe(false);
    cart.total = 20;
    expect(cart.total).toBe(20);
  });

  it("handlers cannot alter Map, Set or Date values seen by later handlers", async () => {
    const bus = createEventBus();
    const seen: unknown[] = [];
    const failures: unknown[] = [];
    bus.on(
      "order.placed",
      (e) => {
        const p = e.payload as { items: Map<string, number>; roles: Set<string> };
        for (const attempt of [
          () => p.items.set("sku-1", 999),
          () => p.roles.add("admin"),
          () => e.timestamp.setTime(0),
        ]) {
          try {
            attempt();
          } catch (error) {
            failures.push(error);
          }
        }
      },
      { priority: 10 },
    );
    bus.on("order.placed", (e) => {
      const p = e.payload as { items: Map<string, number>; roles: Set<string> };
      seen.push(p.items.get("sku-1"), [...p.roles], e.timestamp.getTime() > 0);
    });
    const items = new Map([["sku-1", 1]]);
    await bus.publishEvent({ type: "order.placed", payload: { items, roles: new Set(["user"]) } });
    expect(seen).toEqual([1, ["user"], true]);
    expect(failures).toHaveLength(3);
    expect(items.get("sku-1")).toBe(1);
  });

  it("snapshots keep instanceof, cycles and __proto__ data keys", () => {
    const source: Record<string, unknown> = JSON.parse('{"__proto__": {"x": 1}, "d": 1}');
    source.self = source;
    source.when = new Date(5);
    const copy = createFrozenEventSnapshot(source);
    expect(copy).not.toBe(source);
    expect(copy.self).toBe(copy);
    expect(copy.when).toBeInstanceOf(Date);
    expect(Object.getPrototypeOf(copy)).toBe(Object.prototype);
    expect(Object.hasOwn(copy, "__proto__")).toBe(true);
    expect(Object.isFrozen(copy)).toBe(true);
    expect(Object.isFrozen(source)).toBe(false);
  });
});

describe("EVT-02", () => {
  it("a sibling unsubscribed during a sequential dispatch does not run", async () => {
    const bus = createEventBus();
    const calls: string[] = [];
    let subB: { unsubscribe(): void } | undefined;
    bus.on("session.revoked", () => {
      calls.push("A");
      subB?.unsubscribe();
    }, { priority: 10 });
    subB = bus.on("session.revoked", () => void calls.push("B"));
    await bus.publishEvent({ type: "session.revoked", payload: {} });
    expect(calls).toEqual(["A"]);
  });

  it("no handler runs after the bus is disposed inside a handler", async () => {
    const bus = createEventBus();
    const calls: string[] = [];
    bus.on("x", () => bus.dispose(), { priority: 5 });
    bus.on("x", () => void calls.push("late"));
    await bus.publishEvent({ type: "x", payload: {} });
    expect(calls).toEqual([]);
  });
});

describe("CONV-02", () => {
  it("the default leak warning goes to process.emitWarning, not console", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const emit = vi.spyOn(process, "emitWarning").mockImplementation(() => {});
    const registry = createEventRegistry({ maxHandlersPerPattern: 1 });
    registry.registerHandler("a.b", () => {});
    registry.registerHandler("a.b", () => {});
    expect(warn).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0]?.[1]).toMatchObject({ type: "ZudojsEventsWarning" });
    warn.mockRestore();
    emit.mockRestore();
  });
});
