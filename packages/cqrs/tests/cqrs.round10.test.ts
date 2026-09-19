/**
 * @zudojs/cqrs — Round 10 regression tests.
 */

import { describe, it, expect } from "vitest";

import {
  InvalidMiddlewareError,
  createCommandBus,
  timingMiddleware,
} from "../src/index.js";

describe("CQRS-01", () => {
  it("keeps a successful command successful when onTiming throws", async () => {
    let charged = 0;
    const observed: unknown[] = [];
    const bus = createCommandBus({
      middleware: [
        timingMiddleware({
          onTiming: () => {
            throw new Error("metrics sink down");
          },
          onTimingError: (error) => observed.push(error),
        }),
      ],
    });
    bus.register("charge", async () => {
      charged += 1;
      return "ok";
    });

    await expect(bus.execute({ type: "charge" } as never)).resolves.toBe("ok");
    expect(charged).toBe(1);
    expect((observed[0] as Error).message).toBe("metrics sink down");
  });

  it("surfaces the handler's own error, not the observer's", async () => {
    const bus = createCommandBus({
      middleware: [
        timingMiddleware({
          onTiming: async () => {
            throw new Error("metrics sink down");
          },
          onTimingError: () => {
            throw new Error("reporter also down");
          },
        }),
      ],
    });
    bus.register("charge", async () => {
      throw new Error("card declined");
    });

    await expect(bus.execute({ type: "charge" } as never)).rejects.toThrow(
      "card declined",
    );
  });

  it("rejects a non-function onTimingError", () => {
    expect(() => timingMiddleware({ onTimingError: 1 as never })).toThrow(
      InvalidMiddlewareError,
    );
  });
});
