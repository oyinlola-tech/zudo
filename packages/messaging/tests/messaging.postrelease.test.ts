/**
 * @zudojs/messaging — post-release regression tests.
 *
 * `dispatcher.abort` scheduled its rejection with `setImmediate`, which
 * browsers do not have, so aborting a dispatch there threw
 * "ReferenceError: setImmediate is not defined".
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MessageDispatchAbortedError } from "@zudojs/errors";

import { createMessageBus } from "../src/index.js";

describe("aborting a dispatch without setImmediate (browser)", () => {
  beforeEach(() => {
    vi.stubGlobal("setImmediate", undefined);
    vi.stubGlobal("clearImmediate", undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fails the dispatch instead of throwing a ReferenceError", async () => {
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
    expect(result.handlerResults.map((entry) => entry.success)).toEqual([true]);
  });

  it("records every finished handler before settling", async () => {
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

    expect(result.error).toBeInstanceOf(MessageDispatchAbortedError);
    expect(result.handlerResults).toHaveLength(2);
  });

  it("settles promptly when the handler ignores the signal", async () => {
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
    expect(result.error).toBeInstanceOf(MessageDispatchAbortedError);
  });

  it("disposes cleanly when the dispatch completes without an abort", async () => {
    const bus = createMessageBus();
    bus.on("ok", () => "done");

    const result = await bus.send({ type: "ok", payload: 0 });

    expect(result.success).toBe(true);
    expect(result.value).toBe("done");
  });
});
