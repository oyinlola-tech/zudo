import { describe, it, expect, vi } from "vitest";

import { EventBusState } from "../src/eventBus/eventBus.core.js";

import {
  createEventBus,
  createStartedEventBus,
} from "../src/eventBus/eventBus.factory.js";

import { createEvent, defineEvent } from "../src/eventTypes/eventDefinition.type.js";

import { EventErrorMode } from "../src/eventEmitter/eventEmitter.type.js";

import {
  DuplicateEventHandlerError,
  EventBusDisposedError,
  EventBusStoppedError,
  EventDispatchAbortedError,
  EventHandlerError,
  EventMiddlewareError,
  EventTypeNotFoundError,
  InvalidEventError,
} from "../src/eventErrors/eventError.base.js";

const makeEvent = (type = "test.event", payload: unknown = { x: 0 }) =>
  createEvent({ type, payload });

describe("EventBus lifecycle (EVENTS-03)", () => {
  it("stop() moves to STOPPED and publish/on throw until start()", async () => {
    const bus = createStartedEventBus();
    const handler = vi.fn();
    bus.on("test.event", handler);

    bus.stop();
    expect(bus.getState()).toBe(EventBusState.STOPPED);
    expect(bus.isActive()).toBe(false);

    await expect(bus.publish(makeEvent())).rejects.toBeInstanceOf(
      EventBusStoppedError,
    );
    expect(() => bus.on("test.event", () => {})).toThrow(EventBusStoppedError);
    expect(handler).not.toHaveBeenCalled();
    expect(bus.getState()).toBe(EventBusState.STOPPED);

    bus.start();
    const result = await bus.publish(makeEvent());
    expect(result.handled).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("only auto-starts from CREATED", () => {
    const bus = createEventBus();
    bus.on("*", () => {});
    expect(bus.getState()).toBe(EventBusState.ACTIVE);
  });

  it("throws EventBusDisposedError after dispose", async () => {
    const bus = createStartedEventBus();
    bus.dispose();
    expect(() => bus.start()).toThrow(EventBusDisposedError);
    await expect(bus.publish(makeEvent())).rejects.toBeInstanceOf(
      EventBusDisposedError,
    );
  });
});

describe("EventBus handler store (EVENTS-06, EVENTS-02)", () => {
  it("dispatches handlers registered through the registry", async () => {
    const bus = createStartedEventBus();
    const handler = vi.fn();

    bus.getRegistry().registerHandler("test.event", handler);

    const result = await bus.publish(makeEvent());

    expect(handler).toHaveBeenCalledTimes(1);
    expect(result.handled).toBe(true);
    expect(bus.getHandlers()).toHaveLength(1);
    expect(bus.getRegistry().getHandlers()).toHaveLength(1);
    expect(bus.handlerCount).toBe(1);
  });

  it("rejects duplicate handler ids by default", () => {
    const bus = createStartedEventBus();
    bus.on("test.event", () => {}, { id: "audit" });
    expect(() => bus.on("test.event", () => {}, { id: "audit" })).toThrow(
      DuplicateEventHandlerError,
    );
    expect(bus.handlerCount).toBe(1);
  });

  it("replace policy cancels the old subscription and keeps the new handler", async () => {
    const bus = createStartedEventBus({
      registry: { onDuplicateHandlerId: "replace" },
    });
    const a = vi.fn();
    const b = vi.fn();

    const s1 = bus.on("test.event", a, { id: "h" });
    const s2 = bus.on("test.event", b, { id: "h" });

    expect(s1.active).toBe(false);
    expect(s2.active).toBe(true);
    expect(bus.handlerCount).toBe(1);

    // The old subscription must not remove the replacement.
    s1.unsubscribe();
    expect(bus.handlerCount).toBe(1);
    expect(s2.active).toBe(true);

    await bus.publish(makeEvent());
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });
});

describe("EventBus middleware (EVENTS-04, EVENTS-05, EVENTS-23)", () => {
  it("does not relabel handler errors as middleware errors", async () => {
    const bus = createStartedEventBus({
      emitter: { errorMode: EventErrorMode.THROW },
      middleware: [async (_ctx, next) => next()],
    });

    bus.on("test.event", () => {
      throw new Error("handler boom");
    });

    const error = await bus.publish(makeEvent()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(EventHandlerError);
    expect(error).not.toBeInstanceOf(EventMiddlewareError);
    expect((error as EventHandlerError).cause).toBeInstanceOf(Error);
    expect(((error as EventHandlerError).cause as Error).message).toBe(
      "handler boom",
    );
  });

  it("wraps errors thrown by the middleware itself", async () => {
    const bus = createStartedEventBus({
      middleware: [
        async () => {
          throw new Error("middleware boom");
        },
      ],
    });
    bus.on("test.event", () => {});

    const error = await bus.publish(makeEvent()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(EventMiddlewareError);
    expect((error as EventMiddlewareError).middlewareId).toBe("bus-mw-0");
  });

  it("returns a not-handled result when middleware short-circuits", async () => {
    const bus = createStartedEventBus({
      middleware: [async () => undefined],
    });
    const handler = vi.fn();
    bus.on("test.event", handler);

    const result = await bus.publish(makeEvent());

    expect(result.handled).toBe(false);
    expect(result.shortCircuited).toBe(true);
    expect(result.handlerCount).toBe(0);
    expect(handler).not.toHaveBeenCalled();
  });

  it("validates middleware eagerly in use()", () => {
    const bus = createStartedEventBus();
    expect(() => bus.use("nope" as never)).toThrow(TypeError);
    expect(() => bus.use(async (_c, n) => n(), { priority: NaN })).toThrow(
      RangeError,
    );
  });

  it("gives per-publication middleware stable ids", async () => {
    const bus = createStartedEventBus({
      middleware: [async (_c, n) => n()],
    });
    bus.on("test.event", () => {});

    const result = await bus.publish(makeEvent(), {
      middleware: [async (_c, n) => n()],
    });

    // Executions are recorded in completion order (innermost first).
    expect(result.middlewareExecutions?.map((m) => m.middlewareId)).toEqual([
      "publish-mw-0",
      "bus-mw-0",
    ]);
  });
});

describe("EventBus publish semantics", () => {
  it("emit() accepts event input (EVENTS-30)", async () => {
    const bus = createStartedEventBus();
    const handler = vi.fn();
    bus.on("user.created", handler);

    const result = await bus.emit({
      type: "user.created",
      payload: { id: "1" },
    });

    expect(result.event.type).toBe("user.created");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed events with InvalidEventError (EVENTS-22)", async () => {
    const bus = createStartedEventBus();
    bus.on("user.*", () => {});
    await expect(bus.publish({} as never)).rejects.toBeInstanceOf(
      InvalidEventError,
    );
  });

  it("uses EventTypeNotFoundError for unregistered types (EVENTS-16)", async () => {
    const bus = createStartedEventBus({ requireRegistration: true });
    await expect(bus.publish(makeEvent("nope.event"))).rejects.toBeInstanceOf(
      EventTypeNotFoundError,
    );
  });

  it("registered definitions produce publishable events regardless of casing (EVENTS-11)", async () => {
    const bus = createStartedEventBus({ requireRegistration: true });
    const def = bus.register(defineEvent("User.Created")).definition;
    const handler = vi.fn();
    bus.on("USER.*", handler);

    expect(bus.hasEvent("User.Created")).toBe(true);
    expect(def.type).toBe("user.created");

    const result = await bus.publish(def.create({ id: 1 }));
    expect(result.handled).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("reports handled=false when every handler failed (EVENTS-27)", async () => {
    const bus = createStartedEventBus();
    bus.on("test.event", () => {
      throw new Error("x");
    });

    const result = await bus.publish(makeEvent());

    expect(result.handled).toBe(false);
    expect(result.handlerCount).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.succeeded).toBe(0);
    expect(result.errors[0]).toBeInstanceOf(EventHandlerError);
  });

  it("freezes payloads before dispatch (EVENTS-14)", async () => {
    const bus = createStartedEventBus();
    const seen: unknown[] = [];
    bus.on("test.event", (event) => {
      try {
        (event.payload as { x: number }).x = 1;
      } catch {
        // frozen
      }
    });
    bus.on("test.event", (event) => {
      seen.push({ ...(event.payload as object) });
    });

    await bus.publish(makeEvent("test.event", { x: 0 }));

    expect(seen).toEqual([{ x: 0 }]);
  });

  it("can disable freezing", async () => {
    const bus = createStartedEventBus({ emitter: { freezeEvents: false } });
    bus.on("test.event", (event) => {
      (event.payload as { x: number }).x = 1;
    });
    const payload = { x: 0 };
    await bus.publish(makeEvent("test.event", payload));
    expect(payload.x).toBe(1);
  });

  it("throws EventDispatchAbortedError for a pre-aborted signal", async () => {
    const bus = createStartedEventBus({ middleware: [async (_c, n) => n()] });
    bus.on("test.event", () => {});
    const controller = new AbortController();
    controller.abort();

    await expect(
      bus.publish(makeEvent(), { signal: controller.signal }),
    ).rejects.toBeInstanceOf(EventDispatchAbortedError);
  });

  it("throws EventDispatchAbortedError with partial results mid-dispatch, even through middleware (EVENTS-15)", async () => {
    const bus = createStartedEventBus({ middleware: [async (_c, n) => n()] });
    const controller = new AbortController();
    const second = vi.fn();

    bus.on("test.event", () => {
      controller.abort();
      return "first";
    }, { priority: 10 });
    bus.on("test.event", second);

    const error = await bus
      .publish(makeEvent(), { signal: controller.signal })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(EventDispatchAbortedError);
    expect((error as EventDispatchAbortedError).results).toHaveLength(1);
    expect(second).not.toHaveBeenCalled();
  });

  it("calls onError for handler failures and observer failures (EVENTS-28)", async () => {
    const onError = vi.fn();
    const bus = createStartedEventBus({ onError });

    bus.subscribe(() => {
      throw new Error("observer boom");
    });
    bus.on("test.event", () => {
      throw new Error("handler boom");
    });

    await bus.publish(makeEvent());

    const sources = onError.mock.calls.map((call) => call[1].source);
    expect(sources).toContain("handler");
    expect(sources).toContain("observer");
  });

  it("unregister can remove exact-type handlers (EVENTS-30)", () => {
    const bus = createStartedEventBus();
    bus.register(defineEvent("test.event"));
    bus.on("test.event", () => {});
    bus.on("test.*", () => {});

    bus.unregister("test.event", { removeHandlers: true });

    expect(bus.hasEvent("test.event")).toBe(false);
    expect(bus.handlerCount).toBe(1);
  });
});
