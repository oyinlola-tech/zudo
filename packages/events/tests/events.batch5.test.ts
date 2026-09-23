/**
 * @zudojs/events — batch 5 bug reports.
 */

import { describe, it, expect, expectTypeOf } from "vitest";
import * as errors from "@zudojs/errors";

import {
  EventBus,
  EventBusDisposedError,
  EventBusStoppedError,
  EventDispatchAbortedError,
  EventEmitterMode,
  EventHandlerError,
  EventTimeoutError,
  validateEventMiddleware,
  type EventPublishResult,
} from "../src/index.js";

describe("bus.use() accepts builder middleware", () => {
  it("accepts validateEventMiddleware() and enforces it", async () => {
    const bus = new EventBus();
    const seen: string[] = [];
    bus.on("order.created", (event) => void seen.push(event.type));

    const remove = bus.use(
      validateEventMiddleware((event) => (event.payload as { ok: boolean }).ok),
    );

    await bus.publishEvent({ type: "order.created", payload: { ok: true } });
    await expect(
      bus.publishEvent({ type: "order.created", payload: { ok: false } }),
    ).rejects.toThrow(/failed middleware validation/);
    expect(seen).toEqual(["order.created"]);

    remove();
    await bus.publishEvent({ type: "order.created", payload: { ok: false } });
    expect(seen).toHaveLength(2);
  });

  it("still rejects something that is not middleware", () => {
    const bus = new EventBus();
    expect(() => bus.use(42 as never)).toThrow("Invalid event middleware.");
  });
});

describe("a handler timeout aborts the handler's signal", () => {
  it("context.signal is aborted with the EventTimeoutError", async () => {
    const bus = new EventBus();
    let observed: AbortSignal | undefined;
    let abortedWhileWaiting = false;

    bus.on(
      "slow.job",
      async (_event, context) => {
        observed = context.signal;
        await new Promise<void>((resolve) => {
          context.signal.addEventListener("abort", () => {
            abortedWhileWaiting = true;
            resolve();
          });
          setTimeout(resolve, 500);
        });
      },
      { timeoutMs: 20 },
    );

    const result = await bus.publishEvent({ type: "slow.job", payload: null });

    expect(abortedWhileWaiting).toBe(true);
    expect(observed?.aborted).toBe(true);
    expect(observed?.reason).toBeInstanceOf(EventTimeoutError);
    expect(result.failed).toBe(1);
    expect(result.errors[0]?.cause).toBeInstanceOf(EventTimeoutError);
  });

  it("a timeout in one handler does not abort the dispatch", async () => {
    const bus = new EventBus();
    const ran: string[] = [];
    bus.on("job", () => new Promise((resolve) => setTimeout(resolve, 100)), {
      timeoutMs: 10,
      priority: 1,
    });
    bus.on("job", (_event, context) => {
      ran.push(context.signal.aborted ? "aborted" : "live");
    });
    const result = await bus.publishEvent({ type: "job", payload: null });
    expect(ran).toEqual(["live"]);
    expect(result.succeeded).toBe(1);
  });
});

describe("an abort during the only (or last) handler rejects", () => {
  it("rejects with a single handler that returns normally", async () => {
    const bus = new EventBus();
    const controller = new AbortController();
    bus.on("x", () => {
      controller.abort();
    });
    await expect(
      bus.publishEvent({ type: "x", payload: null }, { signal: controller.signal }),
    ).rejects.toBeInstanceOf(EventDispatchAbortedError);
  });

  it("rejects when the abort happens during the last of two handlers", async () => {
    const bus = new EventBus();
    const controller = new AbortController();
    bus.on("x", () => {}, { priority: 2 });
    bus.on("x", async () => {
      await Promise.resolve();
      controller.abort();
    });
    const failure = await bus
      .publishEvent({ type: "x", payload: null }, { signal: controller.signal })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(EventDispatchAbortedError);
    expect((failure as EventDispatchAbortedError).results).toHaveLength(2);
  });

  it("parallel mode keeps its documented behaviour", async () => {
    const bus = new EventBus({ emitter: { mode: EventEmitterMode.PARALLEL } });
    const controller = new AbortController();
    bus.on("x", () => controller.abort());
    const result = await bus.publishEvent(
      { type: "x", payload: null },
      { signal: controller.signal },
    );
    expect(result.handled).toBe(true);
  });
});

describe("bus lifecycle errors live in @zudojs/errors", () => {
  it("re-exports the same classes", () => {
    expect(EventBusStoppedError).toBe(errors.EventBusStoppedError);
    expect(EventBusDisposedError).toBe(errors.EventBusDisposedError);
  });

  it("throws them from a stopped or disposed bus", async () => {
    const bus = new EventBus().start().stop();
    expect(() => bus.on("a", () => {})).toThrow(errors.EventBusStoppedError);
    bus.dispose();
    expect(() => bus.start()).toThrow(errors.EventBusDisposedError);
    expect(() => bus.start()).toThrow(errors.EventError);
  });
});

describe("PublishResult.errors is EventHandlerError[]", () => {
  it("is typed and populated as EventHandlerError", async () => {
    expectTypeOf<EventPublishResult["errors"]>().toEqualTypeOf<
      readonly EventHandlerError[]
    >();
    const bus = new EventBus();
    bus.on("boom", () => {
      throw new Error("nope");
    });
    const result = await bus.publishEvent({ type: "boom", payload: null });
    const [first] = result.errors;
    expect(first).toBeInstanceOf(EventHandlerError);
    expect(first?.handlerId).toMatch(/^handler:/);
    expect((first?.cause as Error).message).toBe("nope");
  });
});
