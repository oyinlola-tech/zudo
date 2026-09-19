/**
 * @zudojs/cqrs — Round 10 phase 2: shared composer and shared base error.
 */

import { describe, it, expect } from "vitest";

import * as shared from "@zudojs/errors";

import {
  CqrsError,
  CqrsValidationError,
  MiddlewareExecutionError,
  composeMiddleware,
  isCqrsError,
  type CqrsMiddleware,
} from "../src/index.js";

describe("MSG-02 (cqrs): composeMiddleware on @zudojs/middleware compose", () => {
  it("threads replaced requests and contexts through to the terminal", async () => {
    const pipeline = composeMiddleware([
      async (request, context, next) =>
        next({ ...request, type: "renamed" }, { ...context, metadata: { a: 1 } }),
      async (request, context, next) => next(request, context),
    ]);
    const seen = await pipeline({ type: "orig" }, undefined, async (r, c) => [
      r.type,
      c?.metadata,
    ]);
    expect(seen).toEqual(["renamed", { a: 1 }]);
  });

  it("rejects a second next() with MiddlewareExecutionError", async () => {
    const pipeline = composeMiddleware([
      async (request, context, next) => {
        await next(request, context);
        return next(request, context);
      },
    ]);
    await expect(
      pipeline({ type: "x" }, undefined, async () => 1),
    ).rejects.toBeInstanceOf(MiddlewareExecutionError);
  });

  it("isolates concurrent executions of one pipeline", async () => {
    const tag: CqrsMiddleware = async (request, context, next) => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return next(request, context);
    };
    const pipeline = composeMiddleware([tag, tag]);
    const results = await Promise.all(
      ["a", "b", "c"].map((type) =>
        pipeline({ type }, undefined, async (r) => r.type),
      ),
    );
    expect(results).toEqual(["a", "b", "c"]);
  });

  it("has no depth ceiling", async () => {
    const pass: CqrsMiddleware = async (r, c, next) => next(r, c);
    const pipeline = composeMiddleware(Array.from({ length: 150 }, () => pass));
    await expect(pipeline({ type: "x" }, undefined, async () => "ok")).resolves.toBe("ok");
  });
});

describe("H4 / CONV-01: CqrsError is the @zudojs/errors class", () => {
  it("re-exports the shared base and keeps subclass instanceof", () => {
    expect(CqrsError).toBe(shared.CqrsError);
    const err = new CqrsValidationError();
    expect(err).toBeInstanceOf(shared.CqrsError);
    expect(isCqrsError(new shared.CqrsError("m"))).toBe(true);
    expect(new CqrsError("m").code).toBe(shared.ErrorCode.INTERNAL_ERROR);
  });
});
