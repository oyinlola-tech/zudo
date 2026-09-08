import { describe, it, expect } from "vitest";

import { EventBusState } from "../src/eventBus/eventBus.core.js";

import {
  createEventBus,
  createStartedEventBus,
} from "../src/eventBus/eventBus.factory.js";

import type { Event } from "../src/eventTypes/eventDefinition.type.js";

import {
  createEvent,
  defineEvent,
} from "../src/eventTypes/eventDefinition.type.js";

import type { EventMiddleware } from "../src/eventMiddleware/eventMiddleware.type.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TestEvent extends Event {
  readonly type: "test.event";
  readonly payload: {
    readonly value: string;
  };
}

function makeTestEvent(value = "hello"): TestEvent {
  return createEvent({
    type: "test.event",
    payload: { value },
  }) as TestEvent;
}

// ---------------------------------------------------------------------------
// EventBus basics
// ---------------------------------------------------------------------------

describe("EventBus", () => {
  it("creates a bus in CREATED state", () => {
    const bus = createEventBus();
    expect(bus.getState()).toBe(EventBusState.CREATED);
    expect(bus.isActive()).toBe(false);
  });

  it("auto-starts on first use", () => {
    const bus = createEventBus();
    bus.on("*", () => {});
    expect(bus.getState()).toBe(EventBusState.ACTIVE);
  });

  it("starts and stops explicitly", () => {
    const bus = createEventBus();
    bus.start();
    expect(bus.isActive()).toBe(true);
    bus.stop();
    expect(bus.isActive()).toBe(false);
  });

  it("publishes an event to handlers", async () => {
    const bus = createStartedEventBus();
    const received: Event[] = [];

    bus.on("test.event", (event) => {
      received.push(event);
    });

    const event = makeTestEvent();
    const result = await bus.publish(event);

    expect(result.handled).toBe(true);
    expect(result.handlerCount).toBe(1);
    expect(received).toHaveLength(1);
    expect(received[0]!.type).toBe("test.event");
  });

  it("returns errors from handlers", async () => {
    const bus = createStartedEventBus();

    bus.on("test.event", () => {
      throw new Error("handler failure");
    });

    const result = await bus.publish(makeTestEvent());

    expect(result.errors).toHaveLength(1);
  });

  it("unregisters event definitions", () => {
    const bus = createEventBus();

    bus.register(defineEvent("test.event"));

    expect(bus.hasEvent("test.event")).toBe(true);
    bus.unregister("test.event");
    expect(bus.hasEvent("test.event")).toBe(false);
  });

  it("counts handlers", () => {
    const bus = createStartedEventBus();
    expect(bus.handlerCount).toBe(0);

    const sub = bus.on("test.event", () => {});
    expect(bus.handlerCount).toBe(1);

    bus.off(sub);
    expect(bus.handlerCount).toBe(0);
  });

  it("registers one-time handlers", async () => {
    const bus = createStartedEventBus();
    let count = 0;

    bus.once("test.event", () => {
      count++;
    });

    await bus.publish(makeTestEvent());
    await bus.publish(makeTestEvent());

    expect(count).toBe(1);
  });

  it("disposes the bus permanently", () => {
    const bus = createEventBus();
    bus.dispose();
    expect(bus.getState()).toBe(EventBusState.DISPOSED);
    expect(() => bus.on("*", () => {})).toThrow();
  });

  it("subscribes to bus lifecycle events", () => {
    const bus = createEventBus();
    const events: string[] = [];

    bus.subscribe((e) => {
      events.push(e.type);
    });

    bus.start();
    bus.stop();

    expect(events).toEqual(["started", "stopped"]);
  });

  it("publishEvent creates and publishes", async () => {
    const bus = createStartedEventBus();
    let receivedType = "";

    bus.on("test.event", (event) => {
      receivedType = event.type;
    });

    const result = await bus.publishEvent({
      type: "test.event",
      payload: { value: "x" },
    });

    expect(result.event.type).toBe("test.event");
    expect(receivedType).toBe("test.event");
  });
});

// ---------------------------------------------------------------------------
// Middleware integration
// ---------------------------------------------------------------------------

describe("EventBus middleware", () => {
  it("accepts middleware via constructor options", async () => {
    const log: string[] = [];

    const loggingMiddleware: EventMiddleware = async (ctx, next) => {
      log.push(`before:${ctx.event.type}`);
      const result = await next();
      log.push(`after:${ctx.event.type}`);
      return result;
    };

    const bus = createStartedEventBus({
      middleware: [loggingMiddleware],
    });

    bus.on("test.event", () => {});

    await bus.publish(makeTestEvent());

    expect(log).toEqual(["before:test.event", "after:test.event"]);
  });

  it("adds middleware dynamically with use()", async () => {
    const log: string[] = [];

    const bus = createStartedEventBus();

    bus.use(async (ctx, next) => {
      log.push("dynamic-before");
      const result = await next();
      log.push("dynamic-after");
      return result;
    });

    bus.on("test.event", () => {});

    await bus.publish(makeTestEvent());

    expect(log).toEqual(["dynamic-before", "dynamic-after"]);
  });

  it("removes middleware via returned function", async () => {
    const log: string[] = [];

    const bus = createStartedEventBus();

    const remove = bus.use(async (_ctx, next) => {
      log.push("middleware");
      return next();
    });

    bus.on("test.event", () => {});

    await bus.publish(makeTestEvent());
    expect(log).toEqual(["middleware"]);

    log.length = 0;
    remove();

    await bus.publish(makeTestEvent());
    expect(log).toEqual([]);
  });

  it("supports per-publication middleware", async () => {
    const log: string[] = [];

    const bus = createStartedEventBus();
    bus.on("test.event", () => {});

    const perPubMw: EventMiddleware = async (_ctx, next) => {
      log.push("per-pub");
      return next();
    };

    await bus.publish(makeTestEvent(), {
      middleware: [perPubMw],
    });

    expect(log).toEqual(["per-pub"]);
  });

  it("executes middleware in priority order", async () => {
    const log: string[] = [];

    const bus = createStartedEventBus({
      middleware: [
        {
          id: "low",
          priority: 10,
          enabled: true,
          middleware: async (_ctx, next) => {
            log.push("low");
            return next();
          },
        },
        {
          id: "high",
          priority: 100,
          enabled: true,
          middleware: async (_ctx, next) => {
            log.push("high");
            return next();
          },
        },
      ],
    });

    bus.on("test.event", () => {});

    await bus.publish(makeTestEvent());

    expect(log).toEqual(["high", "low"]);
  });

  it("returns middleware executions in result", async () => {
    const bus = createStartedEventBus({
      middleware: [
        async (_ctx, next) => {
          return next();
        },
      ],
    });

    bus.on("test.event", () => {});

    const result = await bus.publish(makeTestEvent());

    expect(result.middlewareExecutions).toBeDefined();
    expect(result.middlewareExecutions).toHaveLength(1);
  });

  it("skips disabled middleware", async () => {
    const log: string[] = [];

    const bus = createStartedEventBus({
      middleware: [
        {
          id: "disabled",
          priority: 0,
          enabled: false,
          middleware: async (_ctx, next) => {
            log.push("should-not-run");
            return next();
          },
        },
      ],
    });

    bus.on("test.event", () => {});

    await bus.publish(makeTestEvent());
    expect(log).toEqual([]);
  });

  it("handles middleware errors", async () => {
    const bus = createStartedEventBus({
      middleware: [
        async () => {
          throw new Error("middleware boom");
        },
      ],
    });

    bus.on("test.event", () => {});

    await expect(bus.publish(makeTestEvent())).rejects.toThrow();
  });
});
