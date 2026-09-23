/**
 * Security review regressions: prototype-polluting keys in decoded frames,
 * and cancellation of server work when the caller goes away.
 */
import { describe, expect, it } from "vitest";

import {
  createRPCFetchHandler,
  createRPCHttpTransport,
  createRPCMemoryTransport,
  createRPCProcedure,
  RPCCancelledError,
  RPCClient,
  RPCServer,
  type RPCContext,
} from "../src/index.js";

function post(body: string, signal?: AbortSignal): Request {
  return new Request("http://rpc.test/rpc", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    ...(signal !== undefined ? { signal } : {}),
  });
}

describe("prototype-polluting keys in frames", () => {
  const seen: unknown[] = [];
  const server = new RPCServer();
  server.register(
    createRPCProcedure("users.save", async (input: unknown) => {
      seen.push(input);
      const target: Record<string, unknown> = {};
      Object.assign(target, input);
      return { admin: target["admin"] ?? null };
    }),
  );
  const handler = createRPCFetchHandler(server);

  it.each([
    ['{"__proto__":{"admin":true}}', "__proto__"],
    ['{"profile":{"constructor":{"prototype":{"admin":true}}}}', "constructor"],
    ['{"list":[{"ok":1},{"prototype":{}}]}', "prototype"],
  ])("refuses payload %s before any handler runs", async (payload, key) => {
    seen.length = 0;
    const response = await handler(
      post(`{"id":"r1","procedure":"users.save","payload":${payload}}`),
    );
    const frame = (await response.json()) as { success: boolean; error: { code: string; message: string } };

    expect(response.status).toBe(400);
    expect(frame.success).toBe(false);
    expect(frame.error.code).toBe("RPC_INVALID_REQUEST");
    expect(frame.error.message).toContain(key);
    expect(seen).toEqual([]);
  });

  it("refuses the same keys in frame metadata", async () => {
    const response = await handler(
      post('{"id":"r1","procedure":"users.save","payload":{},"metadata":{"__proto__":{"userId":"root"}}}'),
    );
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("RPC_INVALID_REQUEST");
  });

  it("lets a server opt out with limits.allowUnsafeKeys", async () => {
    const lenient = new RPCServer(undefined, undefined, { limits: { allowUnsafeKeys: true } });
    lenient.register(createRPCProcedure("users.save", async (input: unknown) => Object.keys(input as object)));
    const response = await createRPCFetchHandler(lenient)(
      post('{"id":"r1","procedure":"users.save","payload":{"constructor":1}}'),
    );
    expect(await response.json()).toMatchObject({ success: true, result: ["constructor"] });
  });

});

describe("cancellation reaches the server", () => {
  function slowServer(observed: { aborted?: boolean; reason?: unknown }): RPCServer {
    const server = new RPCServer();
    server.register(
      createRPCProcedure("slow.wait", (_input: unknown, context: RPCContext) =>
        new Promise((resolve) => {
          const timer = setTimeout(() => resolve("finished"), 2_000);
          context.signal.addEventListener("abort", () => {
            clearTimeout(timer);
            observed.aborted = true;
            observed.reason = context.signal.reason;
            resolve("stopped");
          });
        }),
      ),
    );
    return server;
  }

  it("aborts the procedure when the HTTP request is aborted", async () => {
    const observed: { aborted?: boolean; reason?: unknown } = {};
    const handler = createRPCFetchHandler(slowServer(observed));
    const controller = new AbortController();
    const started = Date.now();
    const pending = handler(post('{"id":"r1","procedure":"slow.wait","payload":null}', controller.signal));
    setTimeout(() => controller.abort(), 30);
    const frame = (await (await pending).json()) as { success: boolean; error?: { code: string } };

    expect(observed.aborted).toBe(true);
    expect(observed.reason).toBeInstanceOf(RPCCancelledError);
    expect(frame.error?.code).toBe("RPC_CANCELLED");
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("aborts the procedure when a memory-transport caller aborts", async () => {
    const observed: { aborted?: boolean } = {};
    const client = new RPCClient(createRPCMemoryTransport(slowServer(observed)));
    const controller = new AbortController();
    const call = client.call("slow.wait", null, { signal: controller.signal });
    setTimeout(() => controller.abort(), 30);

    await expect(call).rejects.toBeInstanceOf(RPCCancelledError);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(observed.aborted).toBe(true);
  });

  it("refuses to start work for an already-aborted request", async () => {
    const observed: { aborted?: boolean } = {};
    const controller = new AbortController();
    controller.abort();
    const response = await slowServer(observed).handle(
      { id: "r1", procedure: "slow.wait", payload: null, metadata: {} } as never,
      { signal: controller.signal },
    );
    expect(response.error?.code).toBe("RPC_CANCELLED");
    expect(observed.aborted).toBeUndefined();
  });
});

describe("HTTP transport deadlines beyond the timer range", () => {
  it.each([3_000_000_000, Number.MAX_SAFE_INTEGER, Number.POSITIVE_INFINITY])(
    "does not fail a call made with timeout %s",
    async (timeout) => {
      const server = new RPCServer();
      server.register(
        createRPCProcedure("slow.echo", async (input: unknown) => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return input;
        }),
      );
      const handler = createRPCFetchHandler(server);
      const client = new RPCClient(
        createRPCHttpTransport({ url: "http://rpc.test/rpc", fetch: (url, init) => handler(new Request(url, init)) }),
        { timeout },
      );

      await expect(client.call("slow.echo", { ok: 1 })).resolves.toEqual({ ok: 1 });
    },
  );
});
