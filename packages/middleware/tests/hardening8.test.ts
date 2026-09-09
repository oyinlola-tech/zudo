/**
 * Regression coverage for the round-8 audit findings (MW-xx).
 */

import { describe, it, expect } from "vitest";
import {
  createPipeline,
  compose,
  resolveMiddleware,
  resolveNamedMiddleware,
  timeoutMiddleware,
  loggingMiddleware,
  rateLimitMiddleware,
} from "../src/index.js";
import type { Middleware, NamedMiddleware } from "../src/index.js";

// ─── MW-01 · A named timeout keeps its name ────────────────────────────────

describe("timeoutMiddleware naming", () => {
  it("uses the configured name for the middleware, not only the error (MW-01)", async () => {
    const mw = timeoutMiddleware<{ id: string }, string>(1_000, {
      name: "db-timeout",
    });
    expect(mw.name).toBe("db-timeout");

    const outcome = await createPipeline([mw], async () => "ok")({ id: "1" });
    expect(outcome.executedMiddleware).toEqual(["db-timeout"]);
  });

  it("tells two timeouts apart in the executed list (MW-01)", async () => {
    const outer = timeoutMiddleware<{ id: string }, string>(1_000, {
      name: "outer",
    });
    const inner = timeoutMiddleware<{ id: string }, string>(1_000, {
      name: "inner",
    });
    const outcome = await createPipeline(
      [outer, inner],
      async () => "ok",
    )({
      id: "1",
    });
    expect(outcome.executedMiddleware).toEqual(["outer", "inner"]);
  });
});

// ─── MW-02 · "continue" never fabricates a result ──────────────────────────

describe("errorMode: continue", () => {
  it("does not report success when a middleware replaces the downstream failure (MW-02)", async () => {
    const wrapper: NamedMiddleware<string, string> = {
      name: "wrapper",
      handler: async (_ctx, next) => {
        try {
          return await next();
        } catch {
          throw new Error("wrapped");
        }
      },
    };

    const pipeline = createPipeline(
      [wrapper],
      async () => {
        throw new Error("handler exploded");
      },
      { errorMode: "continue" },
    );

    const outcome = await pipeline("x");
    expect(outcome.success).toBe(false);
    expect(outcome.result).toBeUndefined();
    expect((outcome.error as Error).message).toBe("wrapped");
  });

  it("still keeps a downstream result the middleware did receive (MW-02)", async () => {
    const late: NamedMiddleware<string, string> = {
      name: "late-failure",
      handler: async (_ctx, next) => {
        const value = await next();
        void value;
        throw new Error("failed after the fact");
      },
    };

    const pipeline = createPipeline([late], async () => "payload", {
      errorMode: "continue",
    });
    const outcome = await pipeline("x");
    expect(outcome.success).toBe(true);
    expect(outcome.result).toBe("payload");
    expect(outcome.errors.map((failure) => failure.name)).toEqual([
      "late-failure",
    ]);
  });

  it("does not let a later middleware see a fabricated undefined (MW-02)", async () => {
    const observed: unknown[] = [];
    const first: NamedMiddleware<string, string> = {
      name: "first",
      priority: 1,
      handler: async (_ctx, next) => {
        const value = await next();
        observed.push(value);
        return value;
      },
    };
    const second: NamedMiddleware<string, string> = {
      name: "second",
      priority: 2,
      handler: async (_ctx, next) => {
        try {
          return await next();
        } catch {
          throw new Error("swallowed and replaced");
        }
      },
    };

    const pipeline = createPipeline(
      [first, second],
      async () => {
        throw new Error("handler exploded");
      },
      { errorMode: "continue" },
    );

    const outcome = await pipeline("x");
    expect(observed).toEqual([]);
    expect(outcome.success).toBe(false);
  });
});

// ─── Ordering is what the pipeline actually runs ───────────────────────────

describe("priority ordering", () => {
  const trace: string[] = [];
  const mark = (name: string): Middleware<string, string> => {
    return async (_ctx, next) => {
      trace.push(name);
      return next();
    };
  };

  it("orders the bare-handler projection the same way (MW-03)", () => {
    const list: NamedMiddleware<string, string>[] = [
      { name: "low", handler: mark("low"), priority: 200 },
      { name: "high", handler: mark("high"), priority: 10 },
      { name: "off", handler: mark("off"), priority: 1, enabled: false },
    ];

    const named = resolveNamedMiddleware(list);
    const bare = resolveMiddleware(list);
    // The projection must be the same list, in the same order — not merely
    // the same length.
    expect(bare).toEqual(named.map((mw) => mw.handler));
    expect(named.map((mw) => mw.name)).toEqual(["high", "low"]);
  });

  it("runs middleware in resolved priority order (MW-03)", async () => {
    trace.length = 0;
    const list: NamedMiddleware<string, string>[] = [
      { name: "third", handler: mark("third"), priority: 30 },
      { name: "first", handler: mark("first"), priority: 10 },
      { name: "second", handler: mark("second"), priority: 20 },
    ];
    await createPipeline(list, async () => "ok")("x");
    expect(trace).toEqual(["first", "second", "third"]);
  });

  it("keeps compose in declaration order (MW-03)", async () => {
    trace.length = 0;
    // `compose` takes bare middleware and cannot reorder: the ordering
    // guarantee belongs to `createPipeline`.
    await compose([mark("a"), mark("b")], async () => "ok")("x");
    expect(trace).toEqual(["a", "b"]);
  });
});

// ─── The README quick start has to compile and run ─────────────────────────

describe("README quick start", () => {
  it("runs exactly as documented", async () => {
    interface RequestContext {
      readonly method?: string;
      readonly path?: string;
      readonly key?: string;
    }

    const pipeline = createPipeline<RequestContext, string>(
      [
        timeoutMiddleware(5_000),
        loggingMiddleware(() => {}),
        rateLimitMiddleware(100, 60_000),
      ],
      async (context) => `handled ${context.method} ${context.path}`,
    );

    const outcome = await pipeline({
      method: "GET",
      path: "/users",
      key: "client-1",
    });

    expect(outcome.success).toBe(true);
    expect(outcome.result).toBe("handled GET /users");
  });
});
