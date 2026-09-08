import { describe, expect, it } from "vitest";

import {
  APIExecutor,
  normalizeAPIError,
} from "../src/api/executor/executor.core.js";

import { createAPIContext } from "../src/api/context/context.type.js";

import { defineOperation } from "../src/api/operation/operation.type.js";

import type { APIOperation } from "../src/api/operation/operation.type.js";

import type {
  APIExecutionContext,
  APIInterceptor,
} from "../src/api/interceptors/interceptor.type.js";

import type { APIResult } from "../src/api/result/apiResult.type.js";

import {
  APIInternalError,
  APITimeoutError,
  APIValidationError,
  ErrorCode,
  isAPIError,
  createNoopInterceptor,
  apiSuccess,
  MAX_INTERCEPTORS,
  MAX_VALIDATION_ISSUES,
  MAX_VALIDATION_ISSUE_LENGTH,
} from "../src/index.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Builds a minimal Standard Schema from a validate function. */
const schema = (
  validate: (value: unknown) =>
    | { value: unknown; issues?: undefined }
    | { issues: ReadonlyArray<{ message: string; path?: readonly string[] }> },
) => ({
  "~standard": { version: 1, vendor: "test", validate },
});

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
      expect(result.error).toBeInstanceOf(APIInternalError);
      expect(result.error.expose).toBe(false);
      expect(result.error.cause).toBeInstanceOf(Error);
      expect((result.error.cause as Error).message).toBe("Not found");
    }
  });

  it("returns frozen results", async () => {
    const executor = new APIExecutor();
    const operation = defineOperation({
      name: "users.get",
      handler: async () => 1,
    });
    const context = createAPIContext("req-1", {});

    const ok = await executor.execute(operation, {}, context);
    expect(Object.isFrozen(ok)).toBe(true);
    expect(() => {
      (ok as unknown as Record<string, unknown>).ok = false;
    }).toThrow();

    const failing = defineOperation({
      name: "users.fail",
      handler: async () => {
        throw new Error("boom");
      },
    });
    const failure = await executor.execute(failing, {}, context);
    expect(Object.isFrozen(failure)).toBe(true);
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

    const executor = new APIExecutor([loggingInterceptor as APIInterceptor]);
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

    const make = (label: string): APIInterceptor => ({
      async intercept(_context, next) {
        order.push(`${label}:before`);
        const result = await next();
        order.push(`${label}:after`);
        return result;
      },
    });

    const executor = new APIExecutor([make("a"), make("b")]);
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

  it("accepts an options object as well as an interceptor array", async () => {
    const executor = new APIExecutor({
      interceptors: [createNoopInterceptor()],
    });
    const operation = defineOperation({
      name: "users.get",
      handler: async () => "ok",
    });
    const context = createAPIContext("req-1", {});

    const result = await executor.execute(operation, {}, context);

    expect(result).toEqual(apiSuccess("ok"));
  });

  it("passes through a no-op interceptor untouched", async () => {
    const executor = new APIExecutor([createNoopInterceptor()]);
    const operation = defineOperation({
      name: "users.get",
      handler: async (input: { id: string }) => `user:${input.id}`,
    });
    const context = createAPIContext("req-1", {});

    const result = await executor.execute(operation, { id: "7" }, context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBe("user:7");
    }
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

  it("still applies a deadline to a hand-rolled operation with an unusable timeout", async () => {
    const executor = new APIExecutor();
    // defineOperation would reject this; a bare object literal can carry it.
    const operation: APIOperation<unknown, string> = {
      name: "slow.op",
      timeout: 0,
      metadata: { timeout: 25 },
      handler: async () => {
        await sleep(500);
        return "too late";
      },
    };
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
      expect(result.error.code).toBe(ErrorCode.OPERATION_CANCELLED);
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
      expect(result.error.code).toBe(ErrorCode.OPERATION_CANCELLED);
    }
  });

  it("wraps non-API errors without copying the internal message", async () => {
    const executor = new APIExecutor();
    const original = new Error(
      'duplicate key value violates unique constraint "users_email_key"',
    );
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
      expect(result.error.message).not.toContain("users_email_key");
      expect(result.error.message).toContain("db.op");
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

    const doubleNextInterceptor: APIInterceptor = {
      async intercept(_context, next) {
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

  it("enforces MAX_INTERCEPTORS in the constructor", () => {
    const tooMany = Array.from({ length: MAX_INTERCEPTORS + 1 }, () =>
      createNoopInterceptor(),
    );
    expect(() => new APIExecutor(tooMany)).toThrow(RangeError);
    expect(() => new APIExecutor({ interceptors: tooMany })).toThrow(RangeError);
  });

  it("rejects an out-of-range maxValidationIssues", () => {
    expect(() => new APIExecutor({ maxValidationIssues: 0 })).toThrow(
      RangeError,
    );
    expect(
      () => new APIExecutor({ maxValidationIssues: MAX_VALIDATION_ISSUES + 1 }),
    ).toThrow(RangeError);
    expect(() => new APIExecutor({ maxValidationIssues: 2.5 })).toThrow(
      RangeError,
    );
  });
});

describe("APIExecutor input validation", () => {
  const idSchema = schema((value) => {
    const input = value as { id?: unknown };
    if (typeof input?.id !== "string") {
      return { issues: [{ message: "id must be a string", path: ["id"] }] };
    }
    return { value: { id: input.id.trim() } };
  });

  it("validates and transforms input against a Standard Schema", async () => {
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
        "id: invalid",
      ]);
    }

    const valid = await executor.execute(operation, { id: "  42  " }, context);
    expect(valid.ok).toBe(true);
    if (valid.ok) {
      expect(valid.data).toBe("user:42"); // schema-transformed (trimmed) input
    }
  });

  it("does not echo submitted values into the client-facing error", async () => {
    const executor = new APIExecutor();
    const leakySchema = schema((value) => ({
      issues: [
        {
          message: `bad value ${JSON.stringify(value)}`,
          path: ["ssn"],
        },
      ],
    }));
    const operation = defineOperation({
      name: "kyc.submit",
      input: leakySchema,
      handler: async () => "never",
    });
    const context = createAPIContext("req-1", {});

    const result = await executor.execute(
      operation,
      { ssn: "123-45-6789" },
      context,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const serialized = JSON.stringify(result.error.toJSON());
      expect(serialized).not.toContain("123-45-6789");
      expect((result.error as APIValidationError).issues).toEqual([
        "ssn: invalid",
      ]);
    }
  });

  it("opts into raw schema messages, still length-capped", async () => {
    const executor = new APIExecutor({ exposeValidationMessages: true });
    const longMessage = "x".repeat(MAX_VALIDATION_ISSUE_LENGTH * 2);
    const operation = defineOperation({
      name: "users.get",
      input: schema(() => ({ issues: [{ message: longMessage }] })),
      handler: async () => "never",
    });
    const context = createAPIContext("req-1", {});

    const result = await executor.execute(operation, {}, context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const issues = (result.error as APIValidationError).issues;
      expect(issues).toHaveLength(1);
      expect(issues[0]!.length).toBe(MAX_VALIDATION_ISSUE_LENGTH);
      expect(issues[0]!.startsWith("xxx")).toBe(true);
    }
  });

  it("caps the number of issues and records how many were dropped", async () => {
    const executor = new APIExecutor();
    const total = MAX_VALIDATION_ISSUES + 30;
    const operation = defineOperation({
      name: "bulk.create",
      input: schema(() => ({
        issues: Array.from({ length: total }, (_unused, index) => ({
          message: `item ${index} is invalid`,
          path: ["items", String(index)],
        })),
      })),
      handler: async () => "never",
    });
    const context = createAPIContext("req-1", {});

    const result = await executor.execute(operation, {}, context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const issues = (result.error as APIValidationError).issues;
      expect(issues).toHaveLength(MAX_VALIDATION_ISSUES + 1);
      expect(issues[0]).toBe("items.0: invalid");
      expect(issues.at(-1)).toContain("30 more issue(s) omitted");
    }
  });

  it("reports (root) for issues without a path", async () => {
    const executor = new APIExecutor();
    const operation = defineOperation({
      name: "users.get",
      input: schema(() => ({ issues: [{ message: "nope" }] })),
      handler: async () => "never",
    });
    const context = createAPIContext("req-1", {});

    const result = await executor.execute(operation, {}, context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result.error as APIValidationError).issues).toEqual([
        "(root): invalid",
      ]);
    }
  });

  it("treats an empty issues array as success", async () => {
    const executor = new APIExecutor();
    const operation = defineOperation({
      name: "users.get",
      input: schema(() => ({ value: "OK", issues: [] as never[] })),
      handler: async (input) => `handled:${String(input)}`,
    });
    const context = createAPIContext("req-1", {});

    const result = await executor.execute(operation, "raw", context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBe("handled:OK");
    }
  });

  it("wraps a schema that throws", async () => {
    const executor = new APIExecutor();
    const operation = defineOperation({
      name: "users.get",
      input: schema(() => {
        throw new Error("schema blew up");
      }),
      handler: async () => "never",
    });
    const context = createAPIContext("req-1", {});

    const result = await executor.execute(operation, {}, context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(APIInternalError);
      expect(result.error.message).not.toContain("schema blew up");
    }
  });
});

describe("APIExecutor output validation", () => {
  it("fails with a non-exposed internal error when output does not match", async () => {
    const executor = new APIExecutor();
    const operation = defineOperation({
      name: "users.get",
      output: schema((value) => {
        const output = value as { passwordHash?: unknown };
        if (output?.passwordHash !== undefined) {
          return {
            issues: [
              {
                message: `unexpected passwordHash ${String(output.passwordHash)}`,
                path: ["passwordHash"],
              },
            ],
          };
        }
        return { value };
      }),
      handler: async () => ({ id: "1", passwordHash: "argon2id$secret" }),
    });
    const context = createAPIContext("req-1", {});

    const result = await executor.execute(operation, {}, context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(APIInternalError);
      expect(result.error.statusCode).toBe(500);
      expect(result.error.expose).toBe(false);
      expect(result.error.message).toContain("passwordHash");
      // The offending value never appears, only the failing path.
      expect(JSON.stringify(result.error.toJSON())).not.toContain(
        "argon2id$secret",
      );
    }
  });

  it("returns the schema-transformed output", async () => {
    const executor = new APIExecutor();
    const operation = defineOperation({
      name: "users.get",
      output: schema((value) => ({
        value: { id: (value as { id: string }).id },
      })),
      handler: async () => ({ id: "1", internalAuditColumn: "leaky" }),
    });
    const context = createAPIContext("req-1", {});

    const result = await executor.execute(operation, {}, context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ id: "1" });
    }
  });

  it("leaves non-schema output values as documentation only", async () => {
    const executor = new APIExecutor();
    const operation = defineOperation({
      name: "users.get",
      output: { parse: () => ({}) },
      handler: async () => ({ id: "1" }),
    });
    const context = createAPIContext("req-1", {});

    const result = await executor.execute(operation, {}, context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ id: "1" });
    }
  });
});

describe("APIExecutionContext", () => {
  it("exposes the result each level actually returned", async () => {
    const seen: Array<APIResult<unknown> | undefined> = [];

    const outer: APIInterceptor = {
      async intercept(context, next) {
        const viaNext = await next();
        seen.push(context.result);
        seen.push(viaNext);
        return viaNext;
      },
    };

    const inner: APIInterceptor = {
      async intercept(_context, next) {
        const result = await next();
        return (result.ok
          ? { ok: true, data: "TRANSFORMED" }
          : result) as APIResult<never>;
      },
    };

    const executor = new APIExecutor([outer, inner]);
    const operation = defineOperation({
      name: "users.get",
      handler: async () => "RAW",
    });
    const context = createAPIContext("req-1", {});

    await executor.execute(operation, {}, context);

    expect(seen[0]).toEqual(seen[1]);
    expect(seen[0]).toEqual({ ok: true, data: "TRANSFORMED" });
  });

  it("is populated when a downstream interceptor short-circuits", async () => {
    let observed: APIResult<unknown> | undefined = undefined;
    const shortCircuited = apiSuccess("FROM_CACHE");

    const auditor: APIInterceptor = {
      async intercept(context, next) {
        const result = await next();
        observed = context.result;
        return result;
      },
    };

    const cache: APIInterceptor = {
      async intercept() {
        return shortCircuited as APIResult<never>;
      },
    };

    const executor = new APIExecutor([auditor, cache]);
    let handlerRan = false;
    const operation = defineOperation({
      name: "users.get",
      handler: async () => {
        handlerRan = true;
        return "RAW";
      },
    });
    const context = createAPIContext("req-1", {});

    await executor.execute(operation, {}, context);

    expect(handlerRan).toBe(false);
    expect(observed).toBe(shortCircuited);
  });

  it("lets an interceptor replace the input the handler receives", async () => {
    const sanitizer: APIInterceptor = {
      async intercept(context, next) {
        (context as unknown as APIExecutionContext<{ id: string }, string>).input = {
          id: "sanitized",
        };
        return next();
      },
    };

    const executor = new APIExecutor([sanitizer]);
    const operation = defineOperation<{ id: string }, string>({
      name: "users.get",
      handler: async (input) => `user:${input.id}`,
    });
    const context = createAPIContext("req-1", {});

    const result = await executor.execute(operation, { id: "raw" }, context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBe("user:sanitized");
    }
  });
});

describe("normalizeAPIError", () => {
  it("returns APIErrors untouched", () => {
    const original = new APIValidationError("Bad input");
    expect(normalizeAPIError(original)).toBe(original);
  });

  it("keeps the internal message off the wrapper", () => {
    const wrapped = normalizeAPIError(new Error("secret-db-detail"), "db.op");

    expect(wrapped).toBeInstanceOf(APIInternalError);
    expect(wrapped.message).not.toContain("secret-db-detail");
    expect(wrapped.expose).toBe(false);
    expect((wrapped.cause as Error).message).toBe("secret-db-detail");
  });

  it("describes non-error throws without emitting \"undefined\"", () => {
    for (const [thrown, description] of [
      ["boom", "string"],
      [null, "null"],
      [42, "number"],
      [{ secret: "s3cret" }, "object"],
      [["a"], "array"],
    ] as const) {
      const wrapped = normalizeAPIError(thrown);
      expect(wrapped.message).not.toContain("undefined");
      expect(wrapped.message).toContain(description);
      expect(wrapped.message).toContain("an API operation");
      expect(wrapped.cause).toBe(thrown);
    }

    expect(normalizeAPIError("boom", "users.get").message).toContain(
      'operation "users.get"',
    );
  });

  it("does not put a thrown value's contents into the message", () => {
    const wrapped = normalizeAPIError("Bearer tok_live_secret");

    expect(wrapped.message).not.toContain("tok_live_secret");
    expect(wrapped.cause).toBe("Bearer tok_live_secret");
  });
});
