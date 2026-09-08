import { describe, it, expect } from "vitest";
import {
  // Core
  compose,
  resolveMiddleware,
  resolveNamedMiddleware,
  withTiming,
  MAX_DEPTH,

  // Pipeline
  createPipeline,

  // Built-in middleware
  loggingMiddleware,
  errorMiddleware,
  timeoutMiddleware,
  rateLimitMiddleware,
  sanitizeLogValue,

  // Errors
  MiddlewareError,
  MiddlewareTimeoutError,
  MiddlewareNextCalledMultipleTimesError,
  MiddlewareLimitExceededError,
  MiddlewareDepthExceededError,
  MiddlewareRateLimitError,
  MiddlewareAbortedError,
} from "../src/index.js";
import type { Middleware, NamedMiddleware } from "../src/index.js";

/** A pass-through middleware of the given result type. */
function passthrough<TContext, TResult>(): Middleware<TContext, TResult> {
  return (_ctx, next) => next();
}

// ─── Compose ───────────────────────────────────────────────────────────────

describe("compose", () => {
  it("should call handler directly when no middleware", async () => {
    const handler = async () => "result";
    const composed = compose<Record<string, never>, string>([], handler);
    expect(await composed({})).toBe("result");
  });

  it("should execute middleware in order", async () => {
    const order: string[] = [];
    const mw1: Middleware<string, string> = async (_ctx, next) => {
      order.push("mw1-before");
      const result = await next();
      order.push("mw1-after");
      return result;
    };
    const mw2: Middleware<string, string> = async (_ctx, next) => {
      order.push("mw2-before");
      const result = await next();
      order.push("mw2-after");
      return result;
    };
    const handler = async () => {
      order.push("handler");
      return "done";
    };

    const composed = compose([mw1, mw2], handler);
    expect(await composed("test")).toBe("done");
    expect(order).toEqual([
      "mw1-before",
      "mw2-before",
      "handler",
      "mw2-after",
      "mw1-after",
    ]);
  });

  it("should propagate errors thrown in middleware", async () => {
    const mw: Middleware<string, string> = async () => {
      throw new Error("middleware error");
    };
    const handler = async () => "result";
    const composed = compose([mw], handler);
    await expect(composed("test")).rejects.toThrow("middleware error");
  });

  it("should detect next() called multiple times", async () => {
    const mw: Middleware<string, string> = async (_ctx, next) => {
      await next();
      return next();
    };
    const handler = async () => "result";
    const composed = compose([mw], handler);
    await expect(composed("test")).rejects.toBeInstanceOf(
      MiddlewareNextCalledMultipleTimesError,
    );
    await expect(composed("test")).rejects.toThrow("called next() multiple");
  });

  it("should reject a chain deeper than maxDepth", () => {
    const list = Array.from({ length: 4 }, () => passthrough<string, string>());
    expect(() => compose(list, async () => "ok", { maxDepth: 3 })).toThrow(
      MiddlewareDepthExceededError,
    );
  });

  it("should expose a default depth limit", () => {
    expect(MAX_DEPTH).toBe(100);
    const list = Array.from({ length: MAX_DEPTH + 1 }, () =>
      passthrough<string, string>(),
    );
    expect(() => compose(list, async () => "ok")).toThrow(
      MiddlewareDepthExceededError,
    );
  });
});

// ─── Named Middleware ──────────────────────────────────────────────────────

describe("NamedMiddleware", () => {
  it("should sort by priority", () => {
    const list: NamedMiddleware<string>[] = [
      { name: "low", handler: passthrough(), priority: 200 },
      { name: "high", handler: passthrough(), priority: 10 },
      { name: "default", handler: passthrough() },
    ];
    expect(resolveMiddleware(list).length).toBe(3);
    expect(resolveNamedMiddleware(list).map((mw) => mw.name)).toEqual([
      "high",
      "default",
      "low",
    ]);
  });

  it("should filter disabled middleware", () => {
    const list: NamedMiddleware<string>[] = [
      { name: "enabled", handler: passthrough() },
      { name: "disabled", handler: passthrough(), enabled: false },
    ];
    expect(resolveMiddleware(list).length).toBe(1);
    expect(resolveNamedMiddleware(list).map((mw) => mw.name)).toEqual([
      "enabled",
    ]);
  });

  it("should keep input order within a priority", () => {
    const list: NamedMiddleware<string>[] = [
      { name: "a", handler: passthrough(), priority: 5 },
      { name: "b", handler: passthrough(), priority: 5 },
      { name: "c", handler: passthrough(), priority: 5 },
    ];
    expect(resolveNamedMiddleware(list).map((mw) => mw.name)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("should not mutate the input array", () => {
    const list: NamedMiddleware<string>[] = [
      { name: "low", handler: passthrough(), priority: 200 },
      { name: "high", handler: passthrough(), priority: 10 },
    ];
    resolveNamedMiddleware(list);
    expect(list.map((mw) => mw.name)).toEqual(["low", "high"]);
  });
});

// ─── Pipeline ──────────────────────────────────────────────────────────────

describe("createPipeline", () => {
  it("should execute middleware and handler", async () => {
    const mw: NamedMiddleware<string, string> = {
      name: "test",
      handler: passthrough(),
    };
    const pipeline = createPipeline([mw], async (ctx) => `result: ${ctx}`);
    const outcome = await pipeline("hello");
    expect(outcome.success).toBe(true);
    expect(outcome.result).toBe("result: hello");
    expect(outcome.executedMiddleware).toEqual(["test"]);
    expect(outcome.durationMs).toBeGreaterThanOrEqual(0);
    expect(outcome.errors).toEqual([]);
  });

  it("should narrow result on success", async () => {
    const pipeline = createPipeline<string, number>([], async () => 42);
    const outcome = await pipeline("x");
    if (outcome.success) {
      // Narrowing must make `result` non-optional.
      const value: number = outcome.result;
      expect(value).toBe(42);
    } else {
      throw new Error("expected success");
    }
  });

  it("should capture errors by default", async () => {
    const mw: NamedMiddleware<string, string> = {
      name: "failing",
      handler: async () => {
        throw new Error("boom");
      },
    };
    const pipeline = createPipeline([mw], async () => "ok");
    const outcome = await pipeline("test");
    expect(outcome.success).toBe(false);
    expect(outcome.error).toBeInstanceOf(Error);
    expect(outcome.errors).toHaveLength(1);
    expect(outcome.errors[0]?.name).toBe("failing");
  });

  it("should rethrow under errorMode: throw", async () => {
    const pipeline = createPipeline<string, string>(
      [],
      async () => {
        throw new Error("boom");
      },
      { errorMode: "throw" },
    );
    await expect(pipeline("test")).rejects.toThrow("boom");
  });

  it("should honour the deprecated stopOnError: false alias", async () => {
    const pipeline = createPipeline<string, string>(
      [],
      async () => {
        throw new Error("boom");
      },
      { stopOnError: false },
    );
    await expect(pipeline("test")).rejects.toThrow("boom");
  });

  it("should step past a failing middleware under errorMode: continue", async () => {
    const seen: string[] = [];
    const failing: NamedMiddleware<string, string> = {
      name: "failing",
      priority: 1,
      handler: async () => {
        throw new Error("boom");
      },
    };
    const after: NamedMiddleware<string, string> = {
      name: "after",
      priority: 2,
      handler: async (_ctx, next) => {
        seen.push("after");
        return next();
      },
    };
    const pipeline = createPipeline([failing, after], async () => "ok", {
      errorMode: "continue",
    });
    const outcome = await pipeline("test");
    expect(outcome.success).toBe(true);
    expect(outcome.result).toBe("ok");
    expect(seen).toEqual(["after"]);
    expect(outcome.errors.map((failure) => failure.name)).toEqual(["failing"]);
  });

  it("should not swallow a handler failure under errorMode: continue", async () => {
    const mw: NamedMiddleware<string, string> = {
      name: "wrapper",
      handler: passthrough(),
    };
    const pipeline = createPipeline(
      [mw],
      async () => {
        throw new Error("handler exploded");
      },
      { errorMode: "continue" },
    );
    const outcome = await pipeline("test");
    expect(outcome.success).toBe(false);
    expect((outcome.error as Error).message).toBe("handler exploded");
    expect(outcome.errors.map((failure) => failure.name)).toEqual(["handler"]);
  });

  it("should respect maxMiddleware", () => {
    const mws: NamedMiddleware<string, string>[] = Array.from(
      { length: 10 },
      (_unused, i) => ({ name: `mw-${i}`, handler: passthrough() }),
    );
    expect(() =>
      createPipeline(mws, async () => "ok", { maxMiddleware: 5 }),
    ).toThrow(MiddlewareLimitExceededError);
  });

  it("should report next() called twice with the middleware name", async () => {
    const mw: NamedMiddleware<string, string> = {
      name: "double-next",
      handler: async (_ctx, next) => {
        await next();
        return next();
      },
    };
    const pipeline = createPipeline([mw], async () => "ok");
    const outcome = await pipeline("test");
    expect(outcome.success).toBe(false);
    expect(outcome.error).toBeInstanceOf(
      MiddlewareNextCalledMultipleTimesError,
    );
    expect((outcome.error as Error).message).toContain("double-next");
  });

  it("should abort through a signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const pipeline = createPipeline<string, string>([], async () => "ok", {
      signal: controller.signal,
    });
    const outcome = await pipeline("test");
    expect(outcome.success).toBe(false);
    expect(outcome.error).toBeInstanceOf(MiddlewareAbortedError);
  });

  it("should abort between middleware", async () => {
    const controller = new AbortController();
    const first: NamedMiddleware<string, string> = {
      name: "first",
      priority: 1,
      handler: async (_ctx, next) => {
        controller.abort();
        return next();
      },
    };
    const second: NamedMiddleware<string, string> = {
      name: "second",
      priority: 2,
      handler: passthrough(),
    };
    const pipeline = createPipeline([first, second], async () => "ok", {
      signal: controller.signal,
    });
    const outcome = await pipeline("test");
    expect(outcome.success).toBe(false);
    expect(outcome.error).toBeInstanceOf(MiddlewareAbortedError);
    expect(outcome.executedMiddleware).toEqual(["first"]);
  });
});

// ─── Built-in Middleware ───────────────────────────────────────────────────

describe("loggingMiddleware", () => {
  it("should log before and after", async () => {
    const logs: string[] = [];
    const mw = loggingMiddleware((msg) => logs.push(msg));
    const pipeline = createPipeline([mw], async () => undefined);
    await pipeline({ method: "GET", path: "/test" });
    expect(logs.length).toBe(2);
    expect(logs[0]).toContain("GET /test");
    expect(logs[1]).toContain("completed");
  });

  it("should escape control characters in logged fields", async () => {
    const logs: string[] = [];
    const mw = loggingMiddleware((msg) => logs.push(msg));
    const pipeline = createPipeline([mw], async () => undefined);
    await pipeline({ method: "GET", path: "/a\r\nFORGED admin" });
    expect(logs[0]).not.toContain("\n");
    expect(logs[0]).toContain("\\r\\n");
  });

  it("should omit the error message by default", async () => {
    const logs: string[] = [];
    const mw = loggingMiddleware((msg) => logs.push(msg));
    const pipeline = createPipeline([mw], async () => {
      throw new Error("password=hunter2");
    });
    await pipeline({ method: "GET", path: "/" });
    expect(logs[1]).toContain("failed");
    expect(logs[1]).not.toContain("hunter2");
  });

  it("should include the error message when asked", async () => {
    const logs: string[] = [];
    const mw = loggingMiddleware((msg) => logs.push(msg), {
      includeErrorMessage: true,
    });
    const pipeline = createPipeline([mw], async () => {
      throw new Error("upstream refused");
    });
    await pipeline({ method: "GET", path: "/" });
    expect(logs[1]).toContain("upstream refused");
  });
});

describe("sanitizeLogValue", () => {
  it("should escape newlines, returns and tabs", () => {
    expect(sanitizeLogValue("a\r\nb\tc")).toBe("a\\r\\nb\\tc");
  });

  it("should escape other control characters as hex", () => {
    expect(sanitizeLogValue("a\u0000b")).toBe("a\\x00b");
  });

  it("should truncate long values", () => {
    expect(sanitizeLogValue("x".repeat(300)).length).toBe(257);
  });

  it("should stringify non-strings", () => {
    expect(sanitizeLogValue(42)).toBe("42");
  });
});

describe("errorMiddleware", () => {
  it("should catch and report errors", async () => {
    let caughtError: unknown = null;
    const mw = errorMiddleware((err) => {
      caughtError = err;
    });
    const pipeline = createPipeline([mw], async () => {
      throw new Error("test error");
    });
    const outcome = await pipeline({});
    expect(outcome.success).toBe(false);
    expect(caughtError).toBeInstanceOf(Error);
  });

  it("should not let a throwing reporter replace the original error", async () => {
    let reporterFailure: unknown = null;
    const mw = errorMiddleware(
      () => {
        throw new Error("reporter exploded");
      },
      (err) => {
        reporterFailure = err;
      },
    );
    const pipeline = createPipeline([mw], async () => {
      throw new Error("original");
    });
    const outcome = await pipeline({});
    expect((outcome.error as Error).message).toBe("original");
    expect((reporterFailure as Error).message).toBe("reporter exploded");
  });
});

describe("timeoutMiddleware", () => {
  it("should allow fast operations", async () => {
    const mw = timeoutMiddleware<unknown>(1000);
    const pipeline = createPipeline([mw], async () => undefined);
    const outcome = await pipeline({});
    expect(outcome.success).toBe(true);
  });

  it("should timeout slow operations with a typed error", async () => {
    const mw = timeoutMiddleware<unknown>(20);
    const pipeline = createPipeline([mw], async () => {
      await new Promise((r) => setTimeout(r, 200));
    });
    const outcome = await pipeline({});
    expect(outcome.success).toBe(false);
    expect(outcome.error).toBeInstanceOf(MiddlewareTimeoutError);
    expect((outcome.error as Error).message).toContain("20ms");
  });

  it("should not leak an unhandled rejection when the loser rejects late", async () => {
    const rejections: unknown[] = [];
    const capture = (reason: unknown): void => {
      rejections.push(reason);
    };
    process.on("unhandledRejection", capture);
    try {
      const mw = timeoutMiddleware<unknown>(10);
      const pipeline = createPipeline([mw], async () => {
        await new Promise((r) => setTimeout(r, 40));
        throw new Error("late failure");
      });
      const outcome = await pipeline({});
      expect(outcome.success).toBe(false);
      await new Promise((r) => setTimeout(r, 80));
    } finally {
      process.off("unhandledRejection", capture);
    }
    expect(rejections).toEqual([]);
  });

  it("should reject an invalid timeout at construction", () => {
    expect(() => timeoutMiddleware<unknown>(0)).toThrow(MiddlewareError);
    expect(() => timeoutMiddleware<unknown>(-1)).toThrow(MiddlewareError);
    expect(() => timeoutMiddleware<unknown>(Number.NaN)).toThrow(
      MiddlewareError,
    );
  });
});

describe("rateLimitMiddleware", () => {
  it("should allow requests within limit", async () => {
    const mw = rateLimitMiddleware<{ key?: string }>(5, 1000);
    const pipeline = createPipeline([mw], async () => undefined);
    for (let i = 0; i < 5; i++) {
      const outcome = await pipeline({ key: "user-1" });
      expect(outcome.success).toBe(true);
    }
  });

  it("should reject requests over limit with retry-after", async () => {
    const mw = rateLimitMiddleware<{ key?: string }>(2, 1000);
    const pipeline = createPipeline([mw], async () => undefined);
    await pipeline({ key: "user-1" });
    await pipeline({ key: "user-1" });
    const outcome = await pipeline({ key: "user-1" });
    expect(outcome.success).toBe(false);
    expect(outcome.error).toBeInstanceOf(MiddlewareRateLimitError);
    const error = outcome.error as MiddlewareRateLimitError;
    expect(error.limit).toBe(2);
    expect(error.windowMs).toBe(1000);
    expect(error.retryAfterMs).toBeGreaterThan(0);
    expect(error.retryAfterMs).toBeLessThanOrEqual(1000);
  });

  it("should track keys independently", async () => {
    const mw = rateLimitMiddleware<{ key?: string }>(1, 1000);
    const pipeline = createPipeline([mw], async () => undefined);
    expect((await pipeline({ key: "a" })).success).toBe(true);
    expect((await pipeline({ key: "b" })).success).toBe(true);
    expect((await pipeline({ key: "a" })).success).toBe(false);
  });

  it("should slide the window rather than reset it", async () => {
    const mw = rateLimitMiddleware<{ key?: string }>(2, 60);
    const pipeline = createPipeline([mw], async () => undefined);
    await pipeline({ key: "u" });
    await new Promise((r) => setTimeout(r, 40));
    await pipeline({ key: "u" });
    // Both requests are still inside the 60ms window.
    expect((await pipeline({ key: "u" })).success).toBe(false);
    // The first has now aged out, so exactly one slot frees up.
    await new Promise((r) => setTimeout(r, 40));
    expect((await pipeline({ key: "u" })).success).toBe(true);
    expect((await pipeline({ key: "u" })).success).toBe(false);
  });

  it("should evict expired keys instead of growing without bound", async () => {
    const mw = rateLimitMiddleware<{ key?: string }>(10, 20, {
      sweepIntervalMs: 0,
    });
    const pipeline = createPipeline([mw], async () => undefined);
    for (let i = 0; i < 50; i++) {
      await pipeline({ key: `key-${i}` });
    }
    expect(mw.size()).toBeGreaterThan(0);
    await new Promise((r) => setTimeout(r, 40));
    await pipeline({ key: "trigger-sweep" });
    expect(mw.size()).toBe(1);
  });

  it("should cap the number of tracked keys", async () => {
    const mw = rateLimitMiddleware<{ key?: string }>(10, 60_000, {
      maxKeys: 5,
    });
    const pipeline = createPipeline([mw], async () => undefined);
    for (let i = 0; i < 50; i++) {
      await pipeline({ key: `key-${i}` });
    }
    expect(mw.size()).toBeLessThanOrEqual(5);
  });

  it("should expose the live window through inspect", async () => {
    const mw = rateLimitMiddleware<{ key?: string }>(3, 1000);
    const pipeline = createPipeline([mw], async () => undefined);
    expect(mw.inspect("u")).toBeUndefined();
    await pipeline({ key: "u" });
    expect(mw.inspect("u")?.count).toBe(1);
    mw.reset();
    expect(mw.inspect("u")).toBeUndefined();
  });

  it("should optionally reject unkeyed requests", async () => {
    const mw = rateLimitMiddleware<{ key?: string }>(1, 1000, {
      rejectUnkeyed: true,
    });
    const pipeline = createPipeline([mw], async () => undefined);
    const outcome = await pipeline({});
    expect(outcome.success).toBe(false);
    expect(outcome.error).toBeInstanceOf(MiddlewareError);
  });

  it("should validate its configuration", () => {
    expect(() => rateLimitMiddleware<{ key?: string }>(0, 1000)).toThrow(
      MiddlewareError,
    );
    expect(() => rateLimitMiddleware<{ key?: string }>(1, 0)).toThrow(
      MiddlewareError,
    );
  });
});

// ─── withTiming ────────────────────────────────────────────────────────────

describe("withTiming", () => {
  it("should wrap middleware with timing info", async () => {
    const inner = passthrough<string, string>();
    const timed = withTiming("timed-mw", inner);
    expect(timed.name).toBe("timed-mw");
    const pipeline = createPipeline([timed], async () => "ok");
    const outcome = await pipeline("test");
    expect(outcome.success).toBe(true);
    expect(outcome.result).toBe("ok");
  });

  it("should report only past the threshold, through the supplied logger", async () => {
    const warnings: string[] = [];
    const slow: Middleware<string, string> = async (_ctx, next) => {
      await new Promise((r) => setTimeout(r, 30));
      return next();
    };
    const quick = withTiming("quick", passthrough<string, string>(), {
      thresholdMs: 20,
      logger: (msg) => warnings.push(msg),
    });
    const sluggish = withTiming("sluggish", slow, {
      thresholdMs: 20,
      logger: (msg) => warnings.push(msg),
    });

    await createPipeline([quick], async () => "ok")("x");
    expect(warnings).toEqual([]);

    await createPipeline([sluggish], async () => "ok")("x");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("sluggish");
  });

  it("should pass through the inner middleware's error", async () => {
    const failing: Middleware<string, string> = async () => {
      throw new Error("inner failed");
    };
    const timed = withTiming("timed", failing);
    const outcome = await createPipeline([timed], async () => "ok")("x");
    expect(outcome.success).toBe(false);
    expect((outcome.error as Error).message).toBe("inner failed");
  });
});

// ─── Errors ────────────────────────────────────────────────────────────────

describe("MiddlewareError", () => {
  it("should create an error with message", () => {
    const error = new MiddlewareError("test error", { middlewareName: "test" });
    expect(error.message).toBe("test error");
    expect(error.name).toBe("MiddlewareError");
  });
});

describe("MiddlewareTimeoutError", () => {
  it("should create a timeout error", () => {
    const error = new MiddlewareTimeoutError("slow-mw", 5000);
    expect(error.message).toContain("slow-mw");
    expect(error.message).toContain("5000");
    expect(error).toBeInstanceOf(MiddlewareError);
  });
});

describe("MiddlewareNextCalledMultipleTimesError", () => {
  it("should create a next-called error", () => {
    const error = new MiddlewareNextCalledMultipleTimesError("bad-mw");
    expect(error.message).toContain("bad-mw");
    expect(error.message).toContain("next()");
    expect(error).toBeInstanceOf(MiddlewareError);
  });
});

describe("MiddlewareLimitExceededError", () => {
  it("should name both counts", () => {
    const error = new MiddlewareLimitExceededError(10, 5);
    expect(error.message).toContain("10");
    expect(error.message).toContain("5");
  });
});

// ─── Result pass-through ───────────────────────────────────────────────────

describe("built-in middleware result pass-through", () => {
  it("should not swallow the handler's result", async () => {
    const pipeline = createPipeline<
      { key?: string; path?: string; method?: string },
      string
    >(
      [
        timeoutMiddleware(5_000),
        loggingMiddleware(() => {}),
        errorMiddleware(),
        rateLimitMiddleware(100, 60_000),
      ],
      async () => "payload",
    );
    const outcome = await pipeline({ key: "c1" });
    expect(outcome.success).toBe(true);
    expect(outcome.result).toBe("payload");
  });
});
