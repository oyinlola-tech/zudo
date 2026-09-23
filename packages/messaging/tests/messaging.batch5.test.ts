/**
 * @zudojs/messaging — batch 5 regression tests.
 *
 * Bugs reproduced by lesson writers against the published package.
 */

import { describe, it, expect } from "vitest";

import {
  MessageDispatchAbortedError,
  MessageTimeoutError,
} from "@zudojs/errors";

import {
  createDerivedMessage,
  createDispatcher,
  createMessage,
  createMessageBus,
  toCausationId,
  toCorrelationId,
} from "../src/index.js";
import type { Message } from "../src/index.js";

describe("an abort during the last handler fails the dispatch", () => {
  it("fails when the only handler returns normally after the abort", async () => {
    const bus = createMessageBus();
    const controller = new AbortController();
    bus.on("t", () => {
      controller.abort();
      return "finished anyway";
    });

    const result = await bus.send(
      { type: "t", payload: 0 },
      { signal: controller.signal },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(MessageDispatchAbortedError);
    expect(result.value).toBeUndefined();
    // The handler itself did finish, and the record says so.
    expect(result.handlerResults.map((entry) => entry.success)).toEqual([true]);
  });

  it("fails when the last of several handlers returns normally after the abort", async () => {
    const bus = createMessageBus();
    const controller = new AbortController();
    bus.on("t", () => 1, { priority: 1 });
    bus.on(
      "t",
      () => {
        controller.abort();
        return 2;
      },
      { priority: 2 },
    );

    const result = await bus.send(
      { type: "t", payload: 0 },
      { signal: controller.signal },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(MessageDispatchAbortedError);
    expect(result.handlerResults).toHaveLength(2);
  });

  it("settles promptly, like a timeout, when the handler ignores the signal", async () => {
    const bus = createMessageBus();
    const controller = new AbortController();
    bus.on(
      "slow",
      () => new Promise((resolve) => setTimeout(() => resolve("late"), 1_000)),
    );

    setTimeout(() => controller.abort(), 20);
    const started = performance.now();
    const result = await bus.send(
      { type: "slow", payload: 0 },
      { signal: controller.signal },
    );

    expect(performance.now() - started).toBeLessThan(500);
    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(MessageDispatchAbortedError);
  });

  it("applies to a dispatcher used directly", async () => {
    const dispatcher = createDispatcher();
    const controller = new AbortController();
    dispatcher.getRegistry().register({
      id: "h",
      name: "h",
      messageTypes: ["t"],
      handler: () => {
        controller.abort();
        return 1;
      },
      enabled: true,
    });

    const result = await dispatcher.dispatch(
      createMessage({ type: "t", payload: 0 }),
      { signal: controller.signal },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(MessageDispatchAbortedError);
  });

  it("still reports a timeout as a MessageTimeoutError", async () => {
    const bus = createMessageBus();
    bus.on("slow", () => new Promise((resolve) => setTimeout(resolve, 500)));

    const result = await bus.send(
      { type: "slow", payload: 0 },
      { timeout: 20 },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(MessageTimeoutError);
  });
});

describe("a correlationId passed through the dispatch context reaches the message", () => {
  it("puts context.correlationId and context.causationId on the sent message", async () => {
    const bus = createMessageBus();
    let seen: Message | undefined;
    bus.on("t", (message) => {
      seen = message;
    });

    const result = await bus.send(
      { type: "t", payload: 0 },
      {
        context: {
          correlationId: toCorrelationId("corr-1"),
          causationId: toCausationId("cause-1"),
        },
      },
    );

    expect(seen?.correlationId).toBe("corr-1");
    expect(seen?.causationId).toBe("cause-1");
    expect(result.message.correlationId).toBe("corr-1");
    expect(result.context.correlationId).toBe("corr-1");
  });

  it("keeps the chain when a handler derives a follow-up message", async () => {
    const bus = createMessageBus();
    let derived: Message | undefined;
    bus.on("t", (message) => {
      derived = createDerivedMessage(message, { type: "t.next", payload: 1 });
    });

    await bus.send(
      { type: "t", payload: 0 },
      { context: { correlationId: toCorrelationId("corr-2") } },
    );

    expect(derived?.correlationId).toBe("corr-2");
  });

  it("lets a correlationId on the input win over the context's", async () => {
    const bus = createMessageBus();
    let seen: Message | undefined;
    bus.on("t", (message) => {
      seen = message;
    });

    await bus.send(
      { type: "t", payload: 0, correlationId: toCorrelationId("from-input") },
      { context: { correlationId: toCorrelationId("from-context") } },
    );

    expect(seen?.correlationId).toBe("from-input");
  });
});
