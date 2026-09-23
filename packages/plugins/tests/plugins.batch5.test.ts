/**
 * @zudojs/plugins — batch 5 bug reports.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EventBus } from "@zudojs/events";

import {
  PLUGIN_EVENTS,
  PluginManager,
  createPluginContext,
  toPluginEvents,
  type PluginEventSource,
  type PluginEvents,
  type PluginLifecycleEvent,
} from "../src/index.js";

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 10));

describe("an async emit that rejects never escapes as an unhandled rejection", () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown): void => {
    unhandled.push(reason);
  };

  beforeEach(() => {
    unhandled.length = 0;
    process.on("unhandledRejection", onUnhandled);
  });
  afterEach(() => {
    process.off("unhandledRejection", onUnhandled);
  });

  function rejectingEvents(): PluginEvents {
    return {
      on() {},
      off() {},
      async emit() {
        throw new Error("subscriber failed");
      },
    };
  }

  it("contains and reports a rejection from context.events", async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const manager = new PluginManager();
    manager.register({ metadata: { name: "p" }, start: () => {} });

    await manager.start(
      createPluginContext({ name: "host" }, { events: rejectingEvents(), logger }),
    );
    await tick();

    expect(unhandled).toEqual([]);
    expect(logger.error).toHaveBeenCalled();
    expect(String(logger.error.mock.calls[0]?.[0])).toMatch(/Listener for "plugin:/);
  });

  it("contains and reports a rejection from the manager's events option", async () => {
    const onError = vi.fn();
    const manager = new PluginManager({ events: rejectingEvents(), onError });
    manager.register({ metadata: { name: "p" } });
    await tick();

    expect(unhandled).toEqual([]);
    expect(onError).toHaveBeenCalledWith(expect.any(Error), "p");
  });
});

describe("an @zudojs/events EventBus is accepted as the event source", () => {
  it("compiles: EventBus is assignable to PluginEventSource", () => {
    const bus = new EventBus();
    const source: PluginEventSource = bus;
    const events: PluginEvents = toPluginEvents(bus);
    expect(source).toBe(bus);
    expect(typeof events.emit).toBe("function");
  });

  it("publishes lifecycle events on the bus instead of throwing InvalidEventError", async () => {
    const bus = new EventBus();
    const seen: string[] = [];
    bus.on("plugin.*", (event) => {
      seen.push(`${event.type}:${(event.payload as PluginLifecycleEvent).plugin.name}`);
    });
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => void unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);

    try {
      const manager = new PluginManager({ events: bus });
      manager.register({ metadata: { name: "p" } });
      await manager.start(createPluginContext({ name: "host" }, { events: bus }));
      await tick();
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }

    expect(unhandled).toEqual([]);
    expect(seen).toContain("plugin.registered:p");
    expect(seen).toContain("plugin.started:p");
  });

  it("lets a plugin subscribe and unsubscribe through context.events", async () => {
    const bus = new EventBus();
    const received: unknown[] = [];
    const handler = (payload: unknown): void => void received.push(payload);
    const events = createPluginContext({ name: "host" }, { events: bus }).events!;

    events.on(PLUGIN_EVENTS.STARTED, handler);
    await events.emit(PLUGIN_EVENTS.STARTED, { n: 1 });
    events.off(PLUGIN_EVENTS.STARTED, handler);
    await events.emit(PLUGIN_EVENTS.STARTED, { n: 2 });

    expect(received).toEqual([{ n: 1 }]);
  });

  it("leaves a PluginEvents sink untouched", () => {
    const sink: PluginEvents = { on() {}, off() {}, emit() {} };
    expect(toPluginEvents(sink)).toBe(sink);
  });
});
