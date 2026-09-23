/**
 * `MessageDispatchAbortedError.cause` is the abort reason the caller gave,
 * wherever in the dispatch the abort is observed.
 */

import { describe, it, expect } from "vitest";

import { MessageDispatchAbortedError } from "@zudojs/errors";

import { createMessage, createMessageBus } from "../src/index.js";

describe("MessageDispatchAbortedError carries the abort reason", () => {
  it("as cause when the signal aborts during the last handler", async () => {
    const bus = createMessageBus();
    const controller = new AbortController();
    const reason = new Error("user navigated away");
    bus.on("t", () => {
      controller.abort(reason);
      return 1;
    });

    const result = await bus.send(
      { type: "t", payload: 0 },
      { signal: controller.signal },
    );

    expect(result.error).toBeInstanceOf(MessageDispatchAbortedError);
    expect(result.error?.cause).toBe(reason);
  });

  it("as cause when the signal aborts between handlers", async () => {
    const bus = createMessageBus();
    const controller = new AbortController();
    const reason = new Error("shutting down");
    bus.on("t", () => {
      controller.abort(reason);
      return 1;
    }, { priority: 1 });
    bus.on("t", () => 2, { priority: 2 });

    const result = await bus.dispatch(
      createMessage({ type: "t", payload: 0 }),
      { signal: controller.signal },
    );

    expect(result.error).toBeInstanceOf(MessageDispatchAbortedError);
    expect(result.error?.cause).toBe(reason);
  });

  it("as cause when the signal was already aborted", async () => {
    const bus = createMessageBus();
    bus.on("t", () => 1);
    const reason = new Error("cancelled before send");

    const failure = await bus
      .send({ type: "t", payload: 0 }, { signal: AbortSignal.abort(reason) })
      .then(
        (result) => result.error,
        (error: unknown) => error,
      );

    expect(failure).toBeInstanceOf(MessageDispatchAbortedError);
    expect((failure as Error).cause).toBe(reason);
  });

  it("uses the default AbortError reason when none was given", async () => {
    const bus = createMessageBus();
    const controller = new AbortController();
    bus.on("t", () => {
      controller.abort();
      return 1;
    });

    const result = await bus.send(
      { type: "t", payload: 0 },
      { signal: controller.signal },
    );

    expect(result.error?.cause).toBe(controller.signal.reason);
    expect((result.error?.cause as Error).name).toBe("AbortError");
  });
});
