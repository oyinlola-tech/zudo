/**
 * Audit round 9 regressions for @zudojs/cqrs.
 *
 * One describe block per finding id.
 */

import { describe, it, expect } from "vitest";

import {
  CqrsError,
  createCommandBus,
  createQueryBus,
  isCqrsError,
  lockMiddleware,
  type CqrsLock,
} from "../src/index.js";

describe("CQRS-R9-01 lockMiddleware awaits release() and surfaces its failure", () => {
  it("awaits an asynchronous release before resolving", async () => {
    const order: string[] = [];
    const lock: CqrsLock = {
      acquire: async () => async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        order.push("released");
      },
    };
    const bus = createCommandBus({ middleware: [lockMiddleware(lock)] });
    bus.register("Ping", async () => {
      order.push("handled");
      return "pong";
    });

    await expect(bus.execute({ type: "Ping" })).resolves.toBe("pong");
    // Previously the release promise was dropped, so "released" landed
    // after execute() had already resolved.
    expect(order).toEqual(["handled", "released"]);
  });

  it("turns a rejected release into a CqrsError instead of an unhandled rejection", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);

    try {
      const lock: CqrsLock = {
        acquire: async () => async () => {
          throw new Error("DEL failed");
        },
      };
      const bus = createQueryBus({ middleware: [lockMiddleware(lock)] });
      bus.register("Find", async () => "row");

      const error = await bus.execute({ type: "Find" }).catch((e: unknown) => e);

      expect(isCqrsError(error)).toBe(true);
      expect(error).toBeInstanceOf(CqrsError);
      expect((error as CqrsError).message).toBe(
        'CQRS lock release failed (key "Find").',
      );
      expect((error as CqrsError).cause).toBeInstanceOf(Error);
      expect((error as CqrsError).metadata).toMatchObject({
        lockKey: "Find",
        requestType: "Find",
      });

      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("keeps the handler's error when both the handler and the release fail", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);

    try {
      let released = 0;
      const lock: CqrsLock = {
        acquire: async () => async () => {
          released += 1;
          throw new Error("DEL failed");
        },
      };
      const bus = createCommandBus({ middleware: [lockMiddleware(lock)] });
      bus.register("Fail", async () => {
        throw new Error("handler failed");
      });

      await expect(bus.execute({ type: "Fail" })).rejects.toThrow(
        "handler failed",
      );
      expect(released).toBe(1);

      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("still accepts a synchronous release", async () => {
    let released = 0;
    const lock: CqrsLock = {
      acquire: () => () => {
        released += 1;
      },
    };
    const bus = createCommandBus({ middleware: [lockMiddleware(lock)] });
    bus.register("Sync", () => 1);

    await expect(bus.execute({ type: "Sync" })).resolves.toBe(1);
    expect(released).toBe(1);
  });
});
