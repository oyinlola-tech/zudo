import { describe, expect, it } from "vitest";

import { APIExecutor } from "../src/api/executor/executor.core.js";

import { createAPIContext } from "../src/api/context/context.type.js";

import { defineOperation } from "../src/api/operation/operation.type.js";

import {
  APIInternalError,
  APITimeoutError,
  APIValidationError,
  isAPIError,
  createNoopInterceptor,
  MAX_INTERCEPTORS,
} from "../src/index.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("APIExecutor", () => {
  it("executes an operation and returns a successful result", async () => {
    const executor = new APIExecutor();
    const operation = defineOperation({
      name: "users.get",
      handler: async () => ({ id: "1", name: "Alice" }),
    });
    const context = createAPIContext("req-1", {});

    const result = await executor.execute(operation, {}, context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ id: "1", name: "Alice" });
    }
  });

  it("returns a failed result when the handler throws", async () => {
    const executor = new APIExecutor();
    const operation = defineOperation({
      name: "users.get",
      handler: async () => {
        throw new Error("Not found");
      },
    });
    const context = createAPIContext("req-1", {});

    const result = await executor.execute(operation, {}, context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe("Not found");
    }
  });

  it("runs interceptors around the handler", async () => {
    const order: string[] = [];

    const loggingInterceptor = {
      async intercept(_context: unknown, next: () => Promise<unknown>) {
        order.push("before");
        const result = await next();
        order.push("after");
        return result;
      },
    };

    const executor = new APIExecutor([loggingInterceptor]);
    const operation = defineOperation({
      name: "users.get",
      handler: async () => {
        order.push("handler");
        return { id: "1" };
      },
    });
    const context = createAPIContext("req-1", {});

    await executor.execute(operation, {}, context);

    expect(order).toEqual(["before", "handler", "after"]);
  });

  it("supports nested interceptors", async () => {
    const order: string[] = [];

    const interceptorA = {
      async intercept(_context: unknown, next: () => Promise<unknown>) {
        order.push("a:before");
        const result = await next();
        order.push("a:after");
        return result;
      },
    };

    const interceptorB = {
      async intercept(_context: unknown, next: () => Promise<unknown>) {
        order.push("b:before");
        const result = await next();
        order.push("b:after");
        return result;
      },
    };

    const executor = new APIExecutor([interceptorA, interceptorB]);
    const operation = defineOperation({
      name: "users.get",
      handler: async () => {
        order.push("handler");
        return { id: "1" };
      },
    });
    const context = createAPIContext("req-1", {});

    await executor.execute(operation, {}, context);

    expect(order).toEqual([
      "a:before",
      "b:before",
      "handler",
      "b:after",
      "a:after",
    ]);
  });

  it("enforces the operation timeout", async () => {
    const executor = new APIExecutor();
    const operation = defineOperation({
      name: "slow.op",
      timeout: 25,
      handler: async () => {
        await sleep(500);
        return "too late";
      },
    });
    const context = createAPIContext("req-1", {});

    const result = await executor.execute(operation, {}, context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(APITimeoutError);
    }
  });

  it("rejects execution when the signal is already aborted", async () => {
    const executor = new APIExecutor();
    let handlerRan = false;
    const operation = defineOperation({
      name: "aborted.op",
      handler: async () => {
        handlerRan = true;
        return "ran";
      },
    });
    const controller = new AbortController();
    controller.abort();
    const context = createAPIContext("req-1", {}, controller.signal);

    const result = await executor.execute(operation, {}, context);

    expect(result.ok).toBe(false);
    expect(handlerRan).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("aborted");
    }
  });

  it("stops waiting when the signal aborts mid-flight", async () => {
    const executor = new APIExecutor();
    const operation = defineOperation({
      name: "abortable.op",
      handler: async () => {
        await sleep(500);
        return "too late";
      },
    });
    const controller = new AbortController();
    const context = createAPIContext("req-1", {}, controller.signal);

    setTimeout(() => controller.abort(), 10);
    const result = await executor.execute(operation, {}, context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("aborted");
    }
  });

  it("wraps non-API errors in APIInternalError, preserving the cause", async () => {
    const executor = new APIExecutor();
    const original = new Error("connect ECONNREFUSED 10.0.3.7:5432");
    const operation = defineOperation({
      name: "db.op",
      handler: async () => {
        throw original;
      },
    });
    const context = createAPIContext("req-1", {});

    const result = await executor.execute(operation, {}, context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(isAPIError(result.error)).toBe(true);
      expect(result.error).toBeInstanceOf(APIInternalError);
      expect(result.error.cause).toBe(original);
    }
  });

  it("passes APIError instances through unwrapped", async () => {
    const executor = new APIExecutor();
    const thrown = new APIValidationError("Bad input", ["id is required"]);
    const operation = defineOperation({
      name: "validate.op",
      handler: async () => {
        throw thrown;
      },
    });
    const context = createAPIContext("req-1", {});

    const result = await executor.execute(operation, {}, context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(thrown);
    }
  });

  it("rejects an interceptor calling next() twice without re-running the handler", async () => {
    let handlerRuns = 0;

    const doubleNextInterceptor = {
      async intercept(_context: unknown, next: () => Promise<unknown>) {
        await next();
        return next(); // illegal second call
      },
    };

    const executor = new APIExecutor([doubleNextInterceptor]);
    const operation = defineOperation({
      name: "retry.op",
      handler: async () => {
        handlerRuns += 1;
        return "ok";
      },
    });
    const context = createAPIContext("req-1", {});

    const result = await executor.execute(operation, {}, context);

    expect(handlerRuns).toBe(1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("next() called multiple times");
    }
  });

  it("validates input against a Standard Schema", async () => {
    const idSchema = {
      "~standard": {
        version: 1,
        vendor: "test",
        validate: (value: unknown) => {
          const input = value as { id?: unknown };
          if (typeof input?.id !== "string") {
            return { issues: [{ message: "id must be a string" }] };
          }
          return { value: { id: input.id.trim() } };
        },
      },
    };

    const executor = new APIExecutor();
    const operation = defineOperation<{ id: string }, string>({
      name: "users.get",
      input: idSchema,
      handler: async (input) => `user:${input.id}`,
    });
    const context = createAPIContext("req-1", {});

    const invalid = await executor.execute(
      operation,
      { id: 42 as unknown as string },
      context,
    );
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.error).toBeInstanceOf(APIValidationError);
      expect((invalid.error as APIValidationError).issues).toEqual([
        "id must be a string",
      ]);
    }

    const valid = await executor.execute(operation, { id: "  42  " }, context);
    expect(valid.ok).toBe(true);
    if (valid.ok) {
      expect(valid.data).toBe("user:42"); // schema-transformed (trimmed) input
    }
  });

  it("enforces MAX_INTERCEPTORS in the constructor", () => {
    const tooMany = Array.from({ length: MAX_INTERCEPTORS + 1 }, () =>
      createNoopInterceptor(),
    );
    expect(() => new APIExecutor(tooMany)).toThrow(RangeError);
  });
});
