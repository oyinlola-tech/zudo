/**
 * @zudojs/messaging — Round 11 regression tests.
 */

import { describe, it, expect } from "vitest";

import { MessageTimeoutError } from "@zudojs/errors";

import {
  createDispatcher,
  createMessage,
  createMessageBus,
} from "../src/index.js";

describe("MSG-M-01", () => {
  it("dispatches an object-form handler registered through addHandler", async () => {
    const bus = createMessageBus();
    bus.addHandler({
      id: "obj",
      name: "obj",
      messageTypes: ["o.o"],
      handler: { handle: () => "from-object" },
      enabled: true,
    });

    const result = await bus.send({ type: "o.o", payload: {} });

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.value).toBe("from-object");
    expect(result.handlerResults[0]?.success).toBe(true);
    bus.dispose();
  });

  it("keeps `this` bound for a class-based object handler", async () => {
    class Audit {
      readonly seen: string[] = [];
      handle(message: { readonly type: string }): string {
        this.seen.push(message.type);
        return "ok";
      }
    }
    const audit = new Audit();
    const bus = createMessageBus();
    bus.addHandler({
      id: "audit",
      name: "audit",
      messageTypes: ["a.a"],
      handler: audit,
      enabled: true,
    });

    const result = await bus.send({ type: "a.a", payload: {} });

    expect(result.success).toBe(true);
    expect(audit.seen).toEqual(["a.a"]);
    bus.dispose();
  });
});

describe("MSG-M-02", () => {
  it("does not mutate handlerResults after the dispatch promise settles", async () => {
    const bus = createMessageBus();
    bus.on(
      "slow.one",
      async () =>
        new Promise((resolve) => setTimeout(() => resolve("late"), 120)),
      { id: "slow-1" },
    );

    const result = await bus.send({ type: "slow.one", payload: {} }, {
      timeout: 20,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(MessageTimeoutError);
    const atSettle = result.handlerResults.length;
    expect(atSettle).toBe(0);

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(result.handlerResults.length).toBe(atSettle);
    bus.dispose();
  });

  it("gives every caller its own handlerResults array", async () => {
    const bus = createMessageBus();
    bus.on("fast.one", () => "ok", { id: "fast-1" });

    const first = await bus.send({ type: "fast.one", payload: {} });
    const second = await bus.send({ type: "fast.one", payload: {} });

    expect(first.handlerResults).not.toBe(second.handlerResults);
    expect(first.handlerResults).toHaveLength(1);
    bus.dispose();
  });
});

describe("MSG-M-03", () => {
  it("exposes dispose, getRegistry and listMiddleware on the Dispatcher type", async () => {
    const dispatcher = createDispatcher();
    const id = dispatcher.use(async (_ctx, next) => next(), { id: "mw" });

    expect(dispatcher.listMiddleware()).toEqual([id]);
    expect(dispatcher.getRegistry().size).toBe(0);

    dispatcher.dispose();

    await expect(
      dispatcher.dispatch(createMessage({ type: "x.y", payload: {} })),
    ).rejects.toThrow();
  });
});
