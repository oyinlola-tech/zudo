/**
 * @zudojs/messaging — Round 9 regression tests.
 */

import { describe, it, expect } from "vitest";
import { getEventListeners } from "node:events";

import {
  HandlerRegistryStore,
  MessageDispatchAbortedError,
  MessageHandlerError,
  createMessage,
  createMessageBus,
  toCorrelationId,
} from "../src/index.js";

describe("MESSAGING-R9-01 caller-provided AbortSignal listeners are released", () => {
  it("leaves no abort listener behind once a dispatch settles", async () => {
    const bus = createMessageBus();
    bus.on("t", () => 1);
    bus.on("fail", () => {
      throw new Error("boom");
    });
    const controller = new AbortController();

    for (let i = 0; i < 25; i++) {
      await bus.dispatch(createMessage({ type: "t", payload: i }), {
        signal: controller.signal,
      });
    }
    await bus.dispatch(createMessage({ type: "fail", payload: 0 }), {
      signal: controller.signal,
    });

    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
  });

  it("still propagates an abort that happens mid-dispatch", async () => {
    const bus = createMessageBus();
    const controller = new AbortController();
    let sawAbort = false;
    bus.on(
      "t",
      (_message, context) =>
        new Promise((resolve) => {
          context.signal.addEventListener("abort", () => {
            sawAbort = true;
            resolve("stopped");
          });
          controller.abort();
        }),
    );

    await bus.dispatch(createMessage({ type: "t", payload: 0 }), {
      signal: controller.signal,
    });

    expect(sawAbort).toBe(true);
  });
});

describe("MESSAGING-R9-02 replacing a handler id re-indexes its message types", () => {
  it("stops routing the old types to the replacement handler", () => {
    const registry = new HandlerRegistryStore({
      allowDuplicateHandlerIds: true,
    });
    registry.register({
      id: "h",
      name: "h",
      handler: () => "A",
      messageTypes: ["a"],
    });
    registry.register({
      id: "h",
      name: "h",
      handler: () => "B",
      messageTypes: ["b"],
    });

    expect(registry.resolve("a")).toHaveLength(0);
    expect(registry.resolve("b").map((handler) => handler.id)).toEqual(["h"]);
    expect(registry.getRegisteredTypes()).toEqual(["b"]);
    expect(registry.size).toBe(1);
  });

  it("lets a single-handler registry replace a handler for the same type", () => {
    const registry = new HandlerRegistryStore({
      allowDuplicateHandlerIds: true,
      allowMultipleHandlers: false,
    });
    registry.register({
      id: "h",
      name: "h",
      handler: () => "A",
      messageTypes: ["a"],
    });

    expect(() =>
      registry.register({
        id: "h",
        name: "h",
        handler: () => "B",
        messageTypes: ["a"],
      }),
    ).not.toThrow();
    expect(() =>
      registry.register({
        id: "other",
        name: "other",
        handler: () => "C",
        messageTypes: ["a"],
      }),
    ).toThrow();
    expect(registry.resolve("a").map((handler) => handler.id)).toEqual(["h"]);
  });
});

describe("MESSAGING-R9-03 handlers receive the dispatch context", () => {
  it("passes DispatchOptions.context and middleware state through to handlers", async () => {
    const bus = createMessageBus();
    const state = new Map<string, unknown>();
    let seen:
      | {
          headers: Readonly<Record<string, unknown>>;
          sameState: boolean;
          fromMiddleware: unknown;
          correlationId: string;
        }
      | undefined;

    bus.use(async (context, next) => {
      context.state.set("fromMiddleware", "yes");
      return next();
    });
    bus.on("t", (_message, context) => {
      seen = {
        headers: context.headers,
        sameState: context.state === state,
        fromMiddleware: context.state.get("fromMiddleware"),
        correlationId: context.correlationId,
      };
    });

    const result = await bus.dispatch(
      createMessage({ type: "t", payload: 0 }),
      {
        context: {
          headers: { tenant: "acme" },
          state,
          correlationId: toCorrelationId("corr-1"),
        },
      },
    );

    expect(result.success).toBe(true);
    expect(seen).toEqual({
      headers: { tenant: "acme" },
      sameState: true,
      fromMiddleware: "yes",
      correlationId: "corr-1",
    });
    expect(result.context.correlationId).toBe("corr-1");
  });
});

describe("MESSAGING-R9-04 an aborted dispatch is not reported as a handler failure", () => {
  it("returns MessageDispatchAbortedError and records only handlers that ran", async () => {
    const bus = createMessageBus();
    const controller = new AbortController();
    bus.on(
      "t",
      () => {
        controller.abort();
        return 1;
      },
      { priority: 1 },
    );
    bus.on("t", () => 2, { priority: 2 });

    const result = await bus.dispatch(
      createMessage({ type: "t", payload: 0 }),
      { signal: controller.signal },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(MessageDispatchAbortedError);
    expect(result.error).not.toBeInstanceOf(MessageHandlerError);
    expect(result.handlerResults.map((entry) => entry.success)).toEqual([
      true,
    ]);
  });
});
