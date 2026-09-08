import { describe, it, expect, vi } from "vitest";
import { createEvent } from "@zudojs/events";
import { publishRuntimeEvent } from "../src/runtimeEvents/index.js";

const event = createEvent({ type: "runtime.test", payload: { ok: true } });

describe("publishRuntimeEvent", () => {
  it("logs and swallows an asynchronous publish failure", async () => {
    const logger = { warn: vi.fn() };
    const eventBus = {
      publish: vi.fn(async () => {
        throw new Error("middleware failed");
      }),
    };

    publishRuntimeEvent(eventBus, logger, event);
    await new Promise((resolve) => setImmediate(resolve));

    expect(eventBus.publish).toHaveBeenCalledWith(event);
    expect(logger.warn).toHaveBeenCalledWith(
      "Failed to publish runtime event.",
      expect.objectContaining({
        eventType: "runtime.test",
        error: "middleware failed",
      }),
    );
  });

  it("logs and swallows a synchronous publish failure (e.g. disposed bus)", () => {
    const logger = { warn: vi.fn() };
    const eventBus = {
      publish: vi.fn((): Promise<unknown> => {
        throw new Error("EventBus has been disposed.");
      }),
    };

    expect(() => publishRuntimeEvent(eventBus, logger, event)).not.toThrow();
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("does not log when publishing succeeds", async () => {
    const logger = { warn: vi.fn() };
    const eventBus = { publish: vi.fn(async () => ({ handled: true })) };

    publishRuntimeEvent(eventBus, logger, event);
    await new Promise((resolve) => setImmediate(resolve));

    expect(logger.warn).not.toHaveBeenCalled();
  });
});
