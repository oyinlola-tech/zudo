import { describe, it, expect, vi } from "vitest";

import {
  EventEmitter,
  createEventEmitter,
} from "../src/eventEmitter/eventEmitter.core.js";

import {
  EventEmitterMode,
  EventErrorMode,
} from "../src/eventEmitter/eventEmitter.type.js";

import { createEvent } from "../src/eventTypes/eventDefinition.type.js";

import {
  DuplicateEventHandlerError,
  EventDispatchAbortedError,
  EventEmitterDisposedError,
  EventHandlerError,
  EventTimeoutError,
  InvalidEventError,
} from "../src/eventErrors/eventError.base.js";

const makeEvent = (type = "test.event") => createEvent({ type, payload: null });

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("EventEmitter once semantics (EVENTS-08)", () => {
  it("removes a throwing once-handler", async () => {
    const emitter = createEventEmitter({ errorMode: EventErrorMode.CONTINUE });
    const handler = vi.fn(() => {
      throw new Error("boom");
    });

    emitter.once("test.event", handler);

    await emitter.emit(makeEvent());
    await emitter.emit(makeEvent());

    expect(handler).toHaveBeenCalledTimes(1);
    expect(emitter.listenerCount).toBe(0);
  });

  it("invokes a once-handler only once across overlapping sequential emits", async () => {
    const emitter = createEventEmitter();
    const handler = vi.fn(async () => {
      await tick();
    });

    emitter.once("test.event", handler);

    await Promise.all([emitter.emit(makeEvent()), emitter.emit(makeEvent())]);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("invokes a once-handler only once across overlapping parallel emits", async () => {
    const emitter = createEventEmitter({ mode: EventEmitterMode.PARALLEL });
    const handler = vi.fn(async () => {
      await tick();
    });

    emitter.once("test.event", handler);

    await Promise.all([emitter.emit(makeEvent()), emitter.emit(makeEvent())]);

    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe("EventEmitter registration (EVENTS-02, EVENTS-20)", () => {
  it("throws on duplicate handler ids", () => {
    const emitter = new EventEmitter();
    emitter.on("t", () => {}, { id: "h" });
    expect(() => emitter.on("t", () => {}, { id: "h" })).toThrow(
      DuplicateEventHandlerError,
    );
  });

  it("off() cancels the subscription and reports whether it was active", () => {
    const emitter = new EventEmitter();
    const sub = emitter.on("t", () => {});
    expect(emitter.off(sub)).toBe(true);
    expect(emitter.off(sub)).toBe(false);
    expect(emitter.listenerCount).toBe(0);
  });

  it("warns once when maxListeners is exceeded", () => {
    const onWarning = vi.fn();
    const emitter = new EventEmitter({ maxListeners: 2, onWarning });

    emitter.on("t", () => {});
    emitter.on("t", () => {});
    expect(onWarning).not.toHaveBeenCalled();

    emitter.on("t", () => {});
    emitter.on("t", () => {});
    expect(onWarning).toHaveBeenCalledTimes(1);
    expect(onWarning.mock.calls[0]![0]).toMatchObject({
      type: "handler.limit",
      pattern: "t",
      limit: 2,
      count: 3,
    });
  });

  it("maxListeners: 0 disables the warning", () => {
    const onWarning = vi.fn();
    const emitter = new EventEmitter({ maxListeners: 0, onWarning });
    for (let i = 0; i < 150; i++) {
      emitter.on("t", () => {});
    }
    expect(onWarning).not.toHaveBeenCalled();
  });

  it("normalizes handler patterns (EVENTS-11)", async () => {
    const emitter = new EventEmitter();
    const handler = vi.fn();
    emitter.on(" USER.* ", handler);

    await emitter.emit(createEvent({ type: "user.created", payload: null }));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("rejects wildcard placements other than a trailing .* (EVENTS-24)", () => {
    const emitter = new EventEmitter();
    expect(() => emitter.on("user.*.created", () => {})).toThrow(TypeError);
    expect(() => emitter.on("user.cre*", () => {})).toThrow(TypeError);
  });
});

describe("EventEmitter dispatch results (EVENTS-27, EVENTS-16)", () => {
  it("wraps handler failures in EventHandlerError and reports counts", async () => {
    const emitter = createEventEmitter({ errorMode: EventErrorMode.CONTINUE });
    emitter.on("t", () => "ok");
    emitter.on("t", () => {
      throw new Error("bad");
    });

    const result = await emitter.emit(makeEvent("t"));

    expect(result.handled).toBe(true);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.results.map((r) => r.ok)).toEqual([true, false]);
    expect(result.errors[0]).toBeInstanceOf(EventHandlerError);
    expect((result.errors[0] as EventHandlerError).handlerId).toBe(
      result.results[1]!.handlerId,
    );
  });

  it("handled is false when every handler failed", async () => {
    const emitter = createEventEmitter({ errorMode: EventErrorMode.CONTINUE });
    emitter.on("t", () => {
      throw new Error("bad");
    });
    const result = await emitter.emit(makeEvent("t"));
    expect(result.handled).toBe(false);
  });

  it("treats a handler that throws undefined as failed in parallel mode", async () => {
    const emitter = createEventEmitter({
      mode: EventEmitterMode.PARALLEL,
      errorMode: EventErrorMode.CONTINUE,
    });
    emitter.on("t", () => {
      // eslint-disable-next-line no-throw-literal
      throw undefined;
    });
    const result = await emitter.emit(makeEvent("t"));
    expect(result.failed).toBe(1);
    expect(result.handled).toBe(false);
  });

  it("THROW mode throws the wrapped handler error", async () => {
    const emitter = createEventEmitter({ errorMode: EventErrorMode.THROW });
    emitter.on("t", () => {
      throw new Error("bad");
    });
    await expect(emitter.emit(makeEvent("t"))).rejects.toBeInstanceOf(
      EventHandlerError,
    );
  });

  it("rejects non-events with InvalidEventError (EVENTS-22)", async () => {
    const emitter = createEventEmitter();
    emitter.on("user.*", () => {});
    await expect(emitter.emit({} as never)).rejects.toBeInstanceOf(
      InvalidEventError,
    );
  });

  it("times out a slow handler when timeoutMs is set", async () => {
    const emitter = createEventEmitter({ errorMode: EventErrorMode.CONTINUE });
    emitter.on(
      "t",
      () => new Promise((resolve) => setTimeout(resolve, 50)),
      { timeoutMs: 5 },
    );

    const result = await emitter.emit(makeEvent("t"));

    expect(result.failed).toBe(1);
    expect(result.results[0]!.error).toBeInstanceOf(EventTimeoutError);
  });
});

describe("EventEmitter abort and dispose (EVENTS-15, EVENTS-16)", () => {
  it("throws EventDispatchAbortedError with partial results in sequential mode", async () => {
    const emitter = createEventEmitter();
    const controller = new AbortController();
    const second = vi.fn();

    emitter.on("t", () => {
      controller.abort();
      return 1;
    }, { priority: 1 });
    emitter.on("t", second);

    const error = await emitter
      .emit(makeEvent("t"), { signal: controller.signal })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(EventDispatchAbortedError);
    expect((error as EventDispatchAbortedError).results).toHaveLength(1);
    expect(second).not.toHaveBeenCalled();
  });

  it("throws EventDispatchAbortedError for a pre-aborted signal in parallel mode", async () => {
    const emitter = createEventEmitter({ mode: EventEmitterMode.PARALLEL });
    emitter.on("t", () => {});
    const controller = new AbortController();
    controller.abort();
    await expect(
      emitter.emit(makeEvent("t"), { signal: controller.signal }),
    ).rejects.toBeInstanceOf(EventDispatchAbortedError);
  });

  it("throws EventEmitterDisposedError after dispose", () => {
    const emitter = createEventEmitter();
    const sub = emitter.on("t", () => {});
    emitter.dispose();
    expect(sub.active).toBe(false);
    expect(() => emitter.on("t", () => {})).toThrow(EventEmitterDisposedError);
    expect(emitter.isDisposed()).toBe(true);
  });

  it("removeAllListeners cancels subscriptions", () => {
    const emitter = createEventEmitter();
    const a = emitter.on("t", () => {});
    const b = emitter.on("u", () => {});
    emitter.removeAllListeners();
    expect(a.active).toBe(false);
    expect(b.active).toBe(false);
    expect(emitter.listenerCount).toBe(0);
  });
});
