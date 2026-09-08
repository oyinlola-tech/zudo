import { describe, it, expect, vi } from "vitest";
import { RPCClient } from "../src/rpc/client/rpcClient.core.js";
import { RPCServer } from "../src/rpc/server/rpcServer.core.js";
import { RPCMiddlewareStack } from "../src/rpc/middleware/rpcMiddleware.core.js";
import { createRPCProcedure } from "../src/rpc/procedure/rpcProcedure.type.js";
import { createRPCRequest } from "../src/rpc/types/rpcRequest.type.js";
import {
  createCancellableSignal,
  cancelSignal,
} from "../src/rpc/reliability/cancellation/rpcCancellation.helper.js";
import {
  withTimeout,
  createTimeout,
} from "../src/rpc/reliability/timeout/rpcTimeout.helper.js";
import {
  retry,
  calculateRetryDelay,
} from "../src/rpc/reliability/retry/rpcRetry.helper.js";
import {
  RPCAuthenticationError,
  RPCForbiddenError,
  RPCRateLimitedError,
} from "../src/rpc/errors/rpc.errors.js";
import { MAX_RPC_PAYLOAD_SIZE } from "../src/rpc/constants/rpcConstants.core.js";
import { schema } from "@zudojs/schema";

const ok = {
  async send() {
    return { id: "x", success: true, result: 1 } as any;
  },
};

describe("regressions: audit round 7", () => {
  it("R-01 pending map drains; thousands of calls succeed", async () => {
    const c = new RPCClient(ok as any);
    for (let i = 0; i < 2000; i++) await c.call("a.b", {});
    expect(c.pendingCount).toBe(0);
  });

  it("R-01 caller signal cancels a call", async () => {
    const slow = {
      async send() {
        return new Promise<never>(() => {});
      },
    };
    const c = new RPCClient(slow as any);
    const ac = new AbortController();
    const p = c.call("a.b", {}, { signal: ac.signal });
    ac.abort();
    await expect(p).rejects.toThrow(/cancel/i);
    expect(c.pendingCount).toBe(0);
  });

  it("R-02 procedure timeout is enforced and aborts the handler", async () => {
    const s = new RPCServer();
    let aborted = false;
    s.register(
      createRPCProcedure(
        "slow.op",
        (_i, ctx) => {
          ctx.signal.addEventListener("abort", () => {
            aborted = true;
          });
          return new Promise((r) => setTimeout(() => r("done"), 3000));
        },
        { timeout: 50 },
      ),
    );
    const t = Date.now();
    const res = await s.handle(
      createRPCRequest({ id: "1", procedure: "slow.op", payload: {} }),
    );
    expect(Date.now() - t).toBeLessThan(500);
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe("RPC_TIMEOUT");
    expect(aborted).toBe(true);
  });

  it("R-02 payload size limit is enforced", async () => {
    const s = new RPCServer();
    s.register(createRPCProcedure("a.b", async () => "ok"));
    const big = "x".repeat(MAX_RPC_PAYLOAD_SIZE + 10);
    const res = await s.handle(
      createRPCRequest({ id: "1", procedure: "a.b", payload: big }),
    );
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe("RPC_INVALID_REQUEST");
  });

  it("R-02 input schema validates untrusted payloads", async () => {
    const s = new RPCServer();
    s.register(
      createRPCProcedure("users.get", async (input: any) => input.id, {
        input: schema.object({ id: schema.string() }),
      }),
    );
    const bad = await s.handle(
      createRPCRequest({
        id: "1",
        procedure: "users.get",
        payload: { id: 42 },
      }),
    );
    expect(bad.success).toBe(false);
    expect(bad.error?.code).toBe("RPC_VALIDATION_ERROR");
    const good = await s.handle(
      createRPCRequest({
        id: "2",
        procedure: "users.get",
        payload: { id: "abc" },
      }),
    );
    expect(good.success).toBe(true);
  });

  it("R-03 internal error detail never reaches the caller", async () => {
    const seen: unknown[] = [];
    const s = new RPCServer(undefined, undefined, {
      onInternalError: (e) => seen.push(e),
    });
    s.register(
      createRPCProcedure("a.b", async () => {
        throw new Error("db password=hunter2 at /srv/secret.ts");
      }),
    );
    const res = await s.handle(
      createRPCRequest({ id: "1", procedure: "a.b", payload: {} }),
    );
    expect(res.error?.code).toBe("RPC_INTERNAL_ERROR");
    expect(JSON.stringify(res)).not.toContain("hunter2");
    expect(JSON.stringify(res)).not.toContain("/srv/secret.ts");
    expect((seen[0] as Error).message).toContain("hunter2"); // logged server-side
  });

  it("R-04 auth/forbidden/rate-limit errors keep their identity", async () => {
    const cases: [Error, string][] = [
      [new RPCAuthenticationError("bad token"), "RPC_UNAUTHENTICATED"],
      [new RPCForbiddenError("nope"), "RPC_FORBIDDEN"],
      [new RPCRateLimitedError("slow down", 30), "RPC_RATE_LIMITED"],
    ];
    for (const [err, code] of cases) {
      const s = new RPCServer(
        undefined,
        new RPCMiddlewareStack([
          async () => {
            throw err;
          },
        ]),
      );
      s.register(createRPCProcedure("a.b", async () => "ok"));
      const res = await s.handle(
        createRPCRequest({ id: "1", procedure: "a.b", payload: {} }),
      );
      expect(res.error?.code).toBe(code);
    }
  });

  it("R-05 cancellation actually works", () => {
    const c = createCancellableSignal();
    expect(c.signal.aborted).toBe(false);
    expect(() => cancelSignal(c)).not.toThrow();
    expect(c.signal.aborted).toBe(true);
  });

  it("R-05 handler receives an abortable signal", async () => {
    const s = new RPCServer();
    let sawSignal = false;
    s.register(
      createRPCProcedure("a.b", async (_i, ctx) => {
        sawSignal = ctx.signal instanceof AbortSignal;
        return 1;
      }),
    );
    await s.handle(
      createRPCRequest({ id: "1", procedure: "a.b", payload: {} }),
    );
    expect(sawSignal).toBe(true);
  });

  it("R-06 middleware calling next() twice is rejected", async () => {
    const s = new RPCServer(
      undefined,
      new RPCMiddlewareStack([
        async (_ctx, next) => {
          await next();
          return next();
        },
      ]),
    );
    let runs = 0;
    s.register(
      createRPCProcedure("a.b", async () => {
        runs++;
        return 1;
      }),
    );
    const res = await s.handle(
      createRPCRequest({ id: "1", procedure: "a.b", payload: {} }),
    );
    expect(runs).toBe(1);
    expect(res.success).toBe(false);
  });

  it("R-07 timeout helpers clear their timers", async () => {
    const before = (process as any)
      .getActiveResourcesInfo()
      .filter((x: string) => x === "Timeout").length;
    await withTimeout(Promise.resolve("fast"), 30000);
    const t = createTimeout(30000);
    t.cancel();
    const after = (process as any)
      .getActiveResourcesInfo()
      .filter((x: string) => x === "Timeout").length;
    expect(after).toBeLessThanOrEqual(before);
  });

  it("R-08 retry jitters and honours an abort signal", async () => {
    const delays = new Set<number>();
    for (let i = 0; i < 30; i++)
      delays.add(
        calculateRetryDelay(3, {
          attempts: 5,
          delay: 100,
          backoff: "exponential",
          jitter: "full",
        }),
      );
    expect(delays.size).toBeGreaterThan(1);

    const ac = new AbortController();
    setTimeout(() => ac.abort(), 20);
    await expect(
      retry(
        async () => {
          throw new Error("fail");
        },
        { attempts: 5, delay: 500, signal: ac.signal },
      ),
    ).rejects.toThrow();
  });

  it("R-09 malformed frames are rejected, not dispatched", async () => {
    const s = new RPCServer();
    s.register(createRPCProcedure("a.b", async () => "ok"));
    for (const bad of [
      null,
      {},
      { id: "1" },
      { id: "", procedure: "a.b" },
      { id: "1", procedure: "NOT VALID", payload: {} },
      { id: "1", procedure: "a.b", payload: {}, metadata: "nope" },
    ]) {
      const res = await s.handle(bad as any);
      expect(res.success).toBe(false);
      expect(res.error?.code).toBe("RPC_INVALID_REQUEST");
    }
  });

  it("R-09 procedure names are validated at definition time", () => {
    expect(() => createRPCProcedure("NoDots", async () => 1)).toThrow();
    expect(() => createRPCProcedure("a.b", async () => 1)).not.toThrow();
  });
});
