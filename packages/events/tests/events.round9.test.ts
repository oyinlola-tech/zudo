/**
 * @zudojs/events — Round 9 regression tests.
 */

import { describe, it, expect, vi } from "vitest";

import {
  createEvent,
  createEventPayload,
  createStartedEventBus,
  defineEvent,
  stripUndefinedValues,
} from "../src/index.js";

describe("EVENTS-R9-01 middleware that awaits next() without returning its result", () => {
  it("reports the handlers that ran instead of a short-circuit", async () => {
    const onError = vi.fn();
    const bus = createStartedEventBus({
      onError,
      middleware: [
        async (_context, next) => {
          await next();
        },
      ],
    });
    bus.on("test.event", () => "ok");
    bus.on("test.event", () => {
      throw new Error("boom");
    });

    const result = await bus.publish(
      createEvent({ type: "test.event", payload: 1 }),
    );

    expect(result.shortCircuited).toBe(false);
    expect(result.handled).toBe(true);
    expect(result.handlerCount).toBe(2);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[1].source).toBe("handler");
  });

  it("still reports a short-circuit when next() is never called", async () => {
    const bus = createStartedEventBus({
      middleware: [async () => "blocked"],
    });
    const handler = vi.fn();
    bus.on("test.event", handler);

    const result = await bus.publish(
      createEvent({ type: "test.event", payload: 1 }),
    );

    expect(result.shortCircuited).toBe(true);
    expect(result.handlerCount).toBe(0);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("EVENTS-R9-02 stripUndefinedValues copies __proto__ as data", () => {
  it("does not replace the prototype of the result", () => {
    const input = JSON.parse(
      '{"__proto__":{"polluted":1},"a":1,"b":null}',
    ) as Record<string, unknown>;

    const result = stripUndefinedValues(input) as Record<string, unknown>;

    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(result.polluted).toBeUndefined();
    expect(Object.keys(result).sort()).toEqual(["__proto__", "a", "b"]);
    expect(
      (createEventPayload(input, { stripUndefined: true }) as { polluted?: 1 })
        .polluted,
    ).toBeUndefined();
  });

  it("still drops undefined values", () => {
    expect(stripUndefinedValues({ a: 1, b: undefined, c: "x" })).toEqual({
      a: 1,
      c: "x",
    });
  });
});

describe("EVENTS-R9-03 unregister({ removeHandlers }) drops disabled handlers", () => {
  it("removes every handler whose pattern is exactly the event type", () => {
    const bus = createStartedEventBus();
    bus.register(defineEvent("test.event"));
    bus.on("test.event", () => {}, { enabled: false });
    bus.on("test.event", () => {});
    bus.on("test.*", () => {});
    bus.on("*", () => {});

    bus.unregister("Test.Event", { removeHandlers: true });

    expect(bus.hasEvent("test.event")).toBe(false);
    expect(bus.getHandlers().map((handler) => handler.eventType).sort()).toEqual(
      ["*", "test.*"],
    );
  });
});

describe("EVENTS-R9-04 bus.dispose() after its registry was disposed", () => {
  it("still disposes the bus instead of throwing", () => {
    const bus = createStartedEventBus();
    bus.on("test.event", () => {});
    bus.getRegistry().dispose();

    expect(() => bus.dispose()).not.toThrow();
    expect(bus.getState()).toBe("disposed");
    expect(bus.getEmitter).toThrow();
    expect(() => bus.dispose()).not.toThrow();
  });
});
