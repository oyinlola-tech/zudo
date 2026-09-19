/**
 * @zudojs/events — Round 10 phase 2: the middleware pipeline runs on
 * `compose` from @zudojs/middleware and keeps the event-specific rules.
 */

import { describe, it, expect } from "vitest";

import {
  EventDispatchAbortedError,
  EventMiddlewareError,
  createEventMiddleware,
  executeEventMiddlewarePipeline,
  type Event,
  type EventMiddlewareContext,
} from "../src/index.js";

function ctx(signal = new AbortController().signal): EventMiddlewareContext {
  return { event: { type: "t", id: "e1" }, signal } as unknown as EventMiddlewareContext;
}

describe("MSG-02 (events): shared composer", () => {
  it("runs by descending priority and records executions", async () => {
    const order: string[] = [];
    const mw = (name: string, priority: number) =>
      createEventMiddleware(async (_c, next) => {
        order.push(name);
        return next();
      }, { id: name, priority });
    const out = await executeEventMiddlewarePipeline(
      [mw("low", 1), mw("high", 5)], ctx(), async () => "done");
    expect(order).toEqual(["high", "low"]);
    expect(out.result).toBe("done");
    expect(out.executions.map((e) => e.middlewareId)).toEqual(["low", "high"]);
  });

  it("rejects a double next() with EventMiddlewareError naming the middleware", async () => {
    const twice = createEventMiddleware(async (_c, next) => {
      await next();
      return next();
    }, { id: "twice" });
    const error = await executeEventMiddlewarePipeline([twice], ctx(), async () => 1)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EventMiddlewareError);
    expect((error as EventMiddlewareError).middlewareId).toBe("twice");
  });

  it("passes downstream errors through unwrapped and wraps the middleware's own", async () => {
    const boom = new Error("handler");
    const pass = createEventMiddleware(async (_c, next) => next(), { id: "pass" });
    await expect(executeEventMiddlewarePipeline([pass], ctx(), async () => {
      throw boom;
    })).rejects.toBe(boom);
    const own = createEventMiddleware<Event, number>(async () => {
      throw new Error("own");
    }, { id: "own" });
    await expect(executeEventMiddlewarePipeline([own], ctx(), async () => 1))
      .rejects.toBeInstanceOf(EventMiddlewareError);
  });

  it("stops at the terminal when the signal aborts mid-pipeline", async () => {
    const controller = new AbortController();
    const abort = createEventMiddleware(async (_c, next) => {
      controller.abort();
      return next();
    });
    await expect(executeEventMiddlewarePipeline([abort], ctx(controller.signal), async () => 1))
      .rejects.toBeInstanceOf(EventDispatchAbortedError);
  });

  it("has no depth ceiling", async () => {
    const many = Array.from({ length: 150 }, () =>
      createEventMiddleware(async (_c, next) => next()));
    const out = await executeEventMiddlewarePipeline(many, ctx(), async () => "ok");
    expect(out.result).toBe("ok");
    expect(out.executions).toHaveLength(150);
  });
});
