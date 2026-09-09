/**
 * Round-9 regression tests.
 *
 * Every case here covers a capability that was exported and documented but
 * not wired: middleware removal, middleware priority, the dispatcher's
 * timeout option, single-handler registries, and the telemetry that dispatch
 * reports back.
 */

import { describe, it, expect } from "vitest";

import { DefaultDispatcher } from "../src/dispatcher/index.js";
import { HandlerRegistryStore } from "../src/handlerRegistry/index.js";
import { createMessageBus } from "../src/messageBus/index.js";
import { createMessage } from "../src/message/index.js";
import type { NamedMessageHandler } from "../src/messageHandler/index.js";
import type { MessageMiddleware } from "../src/messageMiddleware/index.js";
import {
  MessageError,
  MessageMiddlewareError,
  MessageTimeoutError,
} from "@zudojs/errors";

const handlerFor = (
  id: string,
  messageType: string,
  handler: NamedMessageHandler["handler"] = async () => id,
): NamedMessageHandler => ({
  id,
  name: id,
  handler,
  messageTypes: [messageType],
  enabled: true,
});

describe("MSG-01: removeMiddleware actually removes", () => {
  it("removes the middleware and stops running it", async () => {
    const bus = createMessageBus();
    const calls: string[] = [];

    const id = bus.use(async (_ctx, next) => {
      calls.push("mw");
      return next();
    });

    bus.on("t", async () => "ok");

    await bus.dispatch(createMessage({ type: "t", payload: {} }));
    expect(calls).toEqual(["mw"]);

    expect(bus.removeMiddleware(id)).toBe(true);

    await bus.dispatch(createMessage({ type: "t", payload: {} }));
    expect(calls).toEqual(["mw"]);
  });

  it("returns false for an id that was never registered", () => {
    const bus = createMessageBus();
    expect(bus.removeMiddleware("nope")).toBe(false);
  });

  it("honours an explicit id and rejects a duplicate", () => {
    const dispatcher = new DefaultDispatcher();
    const noop: MessageMiddleware = async (_ctx, next) => next();

    expect(dispatcher.use(noop, { id: "audit" })).toBe("audit");
    expect(() => dispatcher.use(noop, { id: "audit" })).toThrow(
      MessageMiddlewareError,
    );
    expect(dispatcher.removeMiddleware("audit")).toBe(true);
    expect(dispatcher.removeMiddleware("audit")).toBe(false);
  });
});

describe("MSG-02: middleware priority orders the pipeline", () => {
  it("runs lower priority first regardless of registration order", async () => {
    const bus = createMessageBus();
    const calls: string[] = [];

    bus.use(
      async (_ctx, next) => {
        calls.push("late");
        return next();
      },
      { priority: 200 },
    );
    bus.use(
      async (_ctx, next) => {
        calls.push("early");
        return next();
      },
      { priority: 1 },
    );

    bus.on("t", async () => {
      calls.push("handler");
      return "ok";
    });

    await bus.dispatch(createMessage({ type: "t", payload: {} }));

    expect(calls).toEqual(["early", "late", "handler"]);
  });

  it("skips middleware registered as disabled", async () => {
    const bus = createMessageBus();
    const calls: string[] = [];

    bus.use(
      async (_ctx, next) => {
        calls.push("off");
        return next();
      },
      { enabled: false },
    );

    bus.on("t", async () => "ok");
    await bus.dispatch(createMessage({ type: "t", payload: {} }));

    expect(calls).toEqual([]);
  });
});

describe("MSG-03: the dispatcher honours DispatchOptions.timeout", () => {
  it("fails a slow dispatch with MessageTimeoutError", async () => {
    const registry = new HandlerRegistryStore();
    registry.register(
      handlerFor(
        "slow",
        "t",
        () => new Promise((resolve) => setTimeout(() => resolve("late"), 200)),
      ),
    );
    const dispatcher = new DefaultDispatcher(registry);

    const result = await dispatcher.dispatch(
      createMessage({ type: "t", payload: {} }),
      { timeout: 10 },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(MessageTimeoutError);
  });

  it("aborts the handler's signal rather than leaving it running", async () => {
    let aborted = false;
    const registry = new HandlerRegistryStore();
    registry.register(
      handlerFor(
        "slow",
        "t",
        (_msg, ctx) =>
          new Promise((resolve) => {
            ctx.signal.addEventListener("abort", () => {
              aborted = true;
              resolve("stopped");
            });
          }),
      ),
    );

    const result = await new DefaultDispatcher(registry).dispatch(
      createMessage({ type: "t", payload: {} }),
      { timeout: 10 },
    );

    expect(result.success).toBe(false);
    expect(aborted).toBe(true);
  });

  it("leaves a fast dispatch alone", async () => {
    const registry = new HandlerRegistryStore();
    registry.register(handlerFor("fast", "t"));

    const result = await new DefaultDispatcher(registry).dispatch(
      createMessage({ type: "t", payload: {} }),
      { timeout: 1_000 },
    );

    expect(result.success).toBe(true);
    expect(result.value).toBe("fast");
  });

  it("applies the bus default timeout", async () => {
    const bus = createMessageBus({ defaultTimeout: 10 });
    bus.on(
      "t",
      () => new Promise((resolve) => setTimeout(() => resolve("late"), 200)),
    );

    const result = await bus.dispatch(
      createMessage({ type: "t", payload: {} }),
    );

    expect(result.error).toBeInstanceOf(MessageTimeoutError);
  });
});

describe("MSG-04: allowMultipleHandlers is enforced", () => {
  it("rejects a second handler for the same type", () => {
    const registry = new HandlerRegistryStore({ allowMultipleHandlers: false });

    registry.register(handlerFor("h1", "t"));

    expect(() => registry.register(handlerFor("h2", "t"))).toThrow(MessageError);
    expect(registry.size).toBe(1);
  });

  it("still allows a handler for a different type", () => {
    const registry = new HandlerRegistryStore({ allowMultipleHandlers: false });

    registry.register(handlerFor("h1", "a"));
    registry.register(handlerFor("h2", "b"));

    expect(registry.size).toBe(2);
  });

  it("permits fan-out by default", () => {
    const registry = new HandlerRegistryStore();

    registry.register(handlerFor("h1", "t"));
    registry.register(handlerFor("h2", "t"));

    expect(registry.resolve("t")).toHaveLength(2);
  });

  it("is reachable through the bus options", () => {
    const bus = createMessageBus({ allowMultipleHandlers: false });
    bus.on("t", async () => "a", { id: "h1" });

    expect(() => bus.on("t", async () => "b", { id: "h2" })).toThrow(
      MessageError,
    );
  });
});

describe("MSG-05: dispatch telemetry describes what happened", () => {
  it("records the failing handler instead of dropping it", async () => {
    const bus = createMessageBus();
    bus.on(
      "t",
      () => {
        throw new Error("boom");
      },
      { id: "broken" },
    );

    const result = await bus.dispatch(
      createMessage({ type: "t", payload: {} }),
    );

    expect(result.success).toBe(false);
    expect(result.handlerResults).toHaveLength(1);
    expect(result.handlerResults[0]!.handlerId).toBe("broken");
    expect(result.handlerResults[0]!.success).toBe(false);
    expect(result.handlerResults[0]!.error).toBeDefined();
  });

  it("labels each middleware execution with its own id and result", async () => {
    const bus = createMessageBus();

    bus.use(async (_ctx, next) => next(), { id: "outer", priority: 1 });
    bus.use(async (_ctx, next) => next(), { id: "inner", priority: 2 });
    bus.on("t", async () => "value");

    const result = await bus.dispatch(
      createMessage({ type: "t", payload: {} }),
    );

    const ids = result.middlewareResult?.executions.map(
      (execution) => execution.middlewareId,
    );
    expect(new Set(ids)).toEqual(new Set(["outer", "inner"]));
    for (const execution of result.middlewareResult?.executions ?? []) {
      expect(execution.result).toBe("value");
    }
  });
});

describe("MSG-06: auto-generated handler ids do not collide", () => {
  it("registers two handlers for one type in the same millisecond", () => {
    const bus = createMessageBus();

    bus.on("t", async () => "a");
    bus.on("t", async () => "b");

    expect(bus.handlerCount).toBe(2);
  });
});
