import { describe, it, expect } from "vitest";
import { createMessageBus } from "../src/messageBus/index.js";
import { createMessage } from "../src/message/index.js";
import { MessageBusDisposedError } from "@zudojs/errors";

describe("MessageBus", () => {
  describe("dispatch", () => {
    it("dispatches a message to a handler", async () => {
      const bus = createMessageBus();
      let received = false;

      bus.on("test.message", async () => {
        received = true;
        return { success: true };
      });

      const result = await bus.dispatch(
        createMessage({ type: "test.message", payload: {} }),
      );

      expect(result.success).toBe(true);
      expect(received).toBe(true);
    });

    it("returns the handler result", async () => {
      const bus = createMessageBus();

      bus.on("test.message", async () => {
        return { value: 42 };
      });

      const result = await bus.dispatch(
        createMessage({ type: "test.message", payload: {} }),
      );

      expect(result.value).toEqual({ value: 42 });
    });

    it("handles multiple handlers", async () => {
      const bus = createMessageBus();
      const calls: string[] = [];

      bus.on(
        "test.message",
        async () => {
          calls.push("h1");
          return "result1";
        },
        { id: "h1" },
      );

      bus.on(
        "test.message",
        async () => {
          calls.push("h2");
          return "result2";
        },
        { id: "h2" },
      );

      const result = await bus.dispatch(
        createMessage({ type: "test.message", payload: {} }),
      );

      expect(calls).toEqual(["h1", "h2"]);
      expect(result.handlerResults).toHaveLength(2);
    });

    it("handles errors in handlers", async () => {
      const bus = createMessageBus();

      bus.on("test.message", async () => {
        throw new Error("handler failed");
      });

      const result = await bus.dispatch(
        createMessage({ type: "test.message", payload: {} }),
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("send", () => {
    it("creates and dispatches a message from input", async () => {
      const bus = createMessageBus();

      bus.on("test.message", async (msg) => {
        return msg.payload;
      });

      const result = await bus.send({
        type: "test.message",
        payload: { value: 42 },
      });

      expect(result.success).toBe(true);
      expect(result.value).toEqual({ value: 42 });
    });
  });

  describe("on", () => {
    it("registers a handler", () => {
      const bus = createMessageBus();

      bus.on("test.message", async () => {});

      expect(bus.handlerCount).toBe(1);
      expect(bus.hasHandlers("test.message")).toBe(true);
    });

    it("uses custom ID", () => {
      const bus = createMessageBus();

      bus.on("test.message", async () => {}, { id: "custom-id" });

      expect(bus.handlerCount).toBe(1);
    });
  });

  describe("off", () => {
    it("removes a handler", () => {
      const bus = createMessageBus();

      bus.on("test.message", async () => {}, { id: "h1" });
      const removed = bus.off("h1");

      expect(removed).toBe(true);
      expect(bus.handlerCount).toBe(0);
    });
  });

  describe("middleware", () => {
    it("executes middleware", async () => {
      const bus = createMessageBus();
      const calls: string[] = [];

      bus.use(async (ctx, next) => {
        calls.push("before");
        const result = await next();
        calls.push("after");
        return result;
      });

      bus.on("test.message", async () => {
        calls.push("handler");
        return "result";
      });

      await bus.dispatch(createMessage({ type: "test.message", payload: {} }));

      expect(calls).toEqual(["before", "handler", "after"]);
    });
  });

  describe("dispose", () => {
    it("disposes the bus", () => {
      const bus = createMessageBus();
      bus.dispose();

      expect(bus.disposed).toBe(true);
    });

    it("throws when dispatching after dispose", async () => {
      const bus = createMessageBus();
      bus.dispose();

      await expect(
        bus.dispatch(createMessage({ type: "test.message", payload: {} })),
      ).rejects.toBeInstanceOf(MessageBusDisposedError);
    });
  });
});
