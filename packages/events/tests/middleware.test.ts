import { describe, it, expect, vi } from "vitest";

import { executeEventMiddlewarePipeline } from "../src/eventMiddleware/eventMiddleware.pipeline.js";

import {
  createEventMiddleware,
  createEventMiddlewareContext,
} from "../src/eventMiddleware/eventMiddleware.helper.js";

import {
  abortableEventMiddleware,
  afterEvent,
  aroundEvent,
  beforeEvent,
  disableEventMiddleware,
  enableEventMiddleware,
  stateEventMiddleware,
  timingEventMiddleware,
  validateEventMiddleware,
} from "../src/eventMiddleware/eventMiddleware.builder.js";

import type { Event } from "../src/eventTypes/eventDefinition.type.js";

import { createEvent } from "../src/eventTypes/eventDefinition.type.js";

import type { RegisteredEventMiddleware } from "../src/eventMiddleware/eventMiddleware.type.js";

import {
  EventDispatchAbortedError,
  EventMiddlewareError,
} from "../src/eventErrors/eventError.base.js";

const event = createEvent({ type: "test.event", payload: { n: 1 } });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMiddleware = RegisteredEventMiddleware<Event, any>;

const run = <T>(
  middleware: readonly AnyMiddleware[],
  terminal: () => Promise<T>,
  signal?: AbortSignal,
) =>
  executeEventMiddlewarePipeline<Event, unknown>(
    middleware,
    createEventMiddlewareContext(event, { signal }),
    terminal as () => Promise<unknown>,
  );

describe("middleware pipeline (EVENTS-04, EVENTS-15)", () => {
  it("passes downstream errors through unwrapped", async () => {
    const boom = new Error("handler boom");
    const passthrough = createEventMiddleware(async (_c, next) => next(), {
      id: "mw",
    });

    const error = await run([passthrough], async () => {
      throw boom;
    }).catch((e: unknown) => e);

    expect(error).toBe(boom);
  });

  it("passes downstream primitive throws through unwrapped", async () => {
    const passthrough = createEventMiddleware(async (_c, next) => next());

    const error = await run([passthrough], async () => {
      // eslint-disable-next-line no-throw-literal
      throw "text";
    }).catch((e: unknown) => e);

    expect(error).toBe("text");
  });

  it("wraps errors thrown by the middleware itself with its id", async () => {
    const failing = createEventMiddleware<Event, unknown>(
      async () => {
        throw new Error("mw boom");
      },
      { id: "failing" },
    );

    const error = await run([failing], async () => 1).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(EventMiddlewareError);
    expect((error as EventMiddlewareError).middlewareId).toBe("failing");
  });

  it("throws EventDispatchAbortedError (not a middleware error) on abort", async () => {
    const controller = new AbortController();
    controller.abort();
    const passthrough = createEventMiddleware(async (_c, next) => next());

    const error = await run([passthrough], async () => 1, controller.signal).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(EventDispatchAbortedError);
    expect(error).not.toBeInstanceOf(EventMiddlewareError);
  });

  it("rejects next() called twice", async () => {
    const twice = createEventMiddleware(async (_c, next) => {
      await next();
      return next();
    });

    await expect(run([twice], async () => 1)).rejects.toThrow(
      /more than once/,
    );
  });

  it("returns undefined result when a middleware short-circuits", async () => {
    const terminal = vi.fn(async () => 1);
    const stop = createEventMiddleware(async () => undefined);

    const result = await run([stop], terminal);

    expect(result.result).toBeUndefined();
    expect(terminal).not.toHaveBeenCalled();
  });

  it("runs middleware in priority order and records executions", async () => {
    const log: string[] = [];
    const a = createEventMiddleware(
      async (_c, next) => {
        log.push("a");
        return next();
      },
      { id: "a", priority: 1 },
    );
    const b = createEventMiddleware(
      async (_c, next) => {
        log.push("b");
        return next();
      },
      { id: "b", priority: 10 },
    );

    const result = await run([a, b], async () => "done");

    expect(log).toEqual(["b", "a"]);
    expect(result.result).toBe("done");
    expect(result.executions.map((e) => e.middlewareId)).toEqual(["a", "b"]);
  });
});

describe("middleware builders", () => {
  it("beforeEvent / afterEvent / aroundEvent", async () => {
    const log: string[] = [];
    const mws = [
      beforeEvent(() => {
        log.push("before");
      }),
      afterEvent((_c, result) => {
        log.push(`after:${String(result)}`);
      }),
      aroundEvent(async (_c, next) => {
        log.push("around");
        return next();
      }),
    ];

    await run(mws, async () => "r");

    // Equal priorities run in registration order; "after" observes
    // the result once the downstream "around" middleware returned.
    expect(log).toEqual(["before", "around", "after:r"]);
  });

  it("validateEventMiddleware rejects invalid events", async () => {
    const mw = validateEventMiddleware(() => false);
    await expect(run([mw], async () => 1)).rejects.toBeInstanceOf(
      EventMiddlewareError,
    );
  });

  it("timingEventMiddleware reports a duration", async () => {
    const callback = vi.fn();
    await run([timingEventMiddleware(callback)], async () => 1);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(typeof callback.mock.calls[0]![0]).toBe("number");
  });

  it("stateEventMiddleware stores state in the context", async () => {
    const ctx = createEventMiddlewareContext(event);
    await executeEventMiddlewarePipeline(
      [stateEventMiddleware("k", () => 42)],
      ctx,
      async () => 1,
    );
    expect(ctx.state.get("k")).toBe(42);
  });

  it("abortableEventMiddleware throws EventDispatchAbortedError", async () => {
    const controller = new AbortController();
    const mw = abortableEventMiddleware();
    const ctx = createEventMiddlewareContext(event, { signal: controller.signal });
    controller.abort();

    await expect(
      executeEventMiddlewarePipeline([mw], ctx, async () => 1),
    ).rejects.toBeInstanceOf(EventDispatchAbortedError);
  });

  it("enable/disable toggles", () => {
    const mw = createEventMiddleware(async (_c, n) => n());
    expect(disableEventMiddleware(mw).enabled).toBe(false);
    expect(enableEventMiddleware(disableEventMiddleware(mw)).enabled).toBe(true);
  });

  it("createEventMiddleware validates input", () => {
    expect(() => createEventMiddleware("x" as never)).toThrow(TypeError);
    expect(() =>
      createEventMiddleware(async (_c, n) => n(), { priority: Infinity }),
    ).toThrow(RangeError);
  });
});
