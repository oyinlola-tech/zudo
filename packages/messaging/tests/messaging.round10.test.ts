/**
 * @zudojs/messaging — Round 10 regression tests.
 */

import { describe, it, expect } from "vitest";

import {
  MiddlewareError,
  MiddlewareNextCalledMultipleTimesError,
} from "@zudojs/errors";

import {
  createMessage,
  createMessageBus,
  resolveMessageHandler,
} from "../src/index.js";

describe("MSG-01", () => {
  it("keeps `this` bound for class-based middleware", async () => {
    class AuditMiddleware {
      readonly seen: string[] = [];
      async handle(
        ctx: { readonly message: { readonly type: string } },
        next: () => Promise<unknown>,
      ): Promise<unknown> {
        this.seen.push(ctx.message.type);
        return next();
      }
    }
    const bus = createMessageBus();
    const audit = new AuditMiddleware();
    bus.use(audit as never);
    bus.on("user.create", async () => "created");

    const result = await bus.send(createMessage({ type: "user.create", payload: {} }));

    expect(result.success).toBe(true);
    expect(audit.seen).toEqual(["user.create"]);
  });

  it("keeps `this` bound for class-based handlers", async () => {
    class Handler {
      private readonly prefix = "hello ";
      async handle(message: { readonly payload: unknown }): Promise<string> {
        return this.prefix + String(message.payload);
      }
    }
    const resolved = resolveMessageHandler(new Handler() as never);

    await expect(
      resolved(createMessage({ type: "x", payload: "bob" }), {} as never),
    ).resolves.toBe("hello bob");
  });
});

describe("MSG-02", () => {
  it("reports a double next() with the shared @zudojs/errors type", async () => {
    const bus = createMessageBus();
    bus.use(async (_ctx, next) => {
      await next();
      return next();
    });
    bus.on("x", async () => 1);

    const result = await bus.send(createMessage({ type: "x", payload: {} }));

    expect(result.success).toBe(false);
    const error = (result as { readonly error?: unknown }).error;
    expect(error).toBeInstanceOf(MiddlewareNextCalledMultipleTimesError);
    expect(error).toBeInstanceOf(MiddlewareError);
  });
});

describe("MSG-02 (phase 2): built on @zudojs/middleware compose", () => {
  it("names the offending middleware the way the shared composer does", async () => {
    const bus = createMessageBus();
    bus.use(async (_ctx, next) => {
      await next();
      return next();
    });
    bus.on("x", async () => 1);
    const result = await bus.send(createMessage({ type: "x", payload: {} }));
    const error = (result as { readonly error?: unknown }).error;
    expect((error as MiddlewareError).middlewareName).toBe("middleware[0]");
  });

  it("keeps long pipelines working (no depth ceiling)", async () => {
    const bus = createMessageBus();
    for (let i = 0; i < 150; i += 1) {
      bus.use(async (_ctx, next) => next());
    }
    bus.on("x", async () => 7);
    const result = await bus.send(createMessage({ type: "x", payload: {} }));
    expect(result.success).toBe(true);
  });
});
