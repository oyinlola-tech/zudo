/**
 * HTTP transport and fetch handler, over web-standard Request/Response and
 * over a real socket with the global fetch.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { schema } from "@zudojs/schema";

import {
  createRPCFetchHandler,
  createRPCHttpTransport,
  createRPCProcedure,
  createRPCRequest,
  INTERNAL_ERROR_MESSAGE,
  RPCAuthenticationError,
  RPCCancelledError,
  RPCClient,
  RPCForbiddenError,
  RPCProcedureNotFoundError,
  RPCServer,
  RPCTimeoutError,
  RPCTransportError,
  RPCValidationError,
  type RPCContext,
  type RPCError,
} from "../src/index.js";

const URL_ = "http://rpc.test/rpc";

function buildServer(onInternalError?: (error: unknown) => void): RPCServer {
  const server = new RPCServer(undefined, undefined, { onInternalError });
  server.register(
    createRPCProcedure(
      "math.add",
      async (input: { a: number; b: number }) => input.a + input.b,
      { input: schema.object({ a: schema.number(), b: schema.number() }) },
    ),
  );
  server.register(
    createRPCProcedure("who.ami", async (_i: unknown, context: RPCContext) => context.auth ?? null),
  );
  server.register(
    createRPCProcedure("db.query", async () => {
      throw new Error("secret-connection-string");
    }),
  );
  server.register(
    createRPCProcedure("slow.call", () => new Promise((resolve) => setTimeout(resolve, 500))),
  );
  return server;
}

/** A transport whose fetch goes straight into the handler — no socket. */
function wired(handler: (request: Request) => Promise<Response>, headers?: Record<string, string>) {
  return createRPCHttpTransport({
    url: URL_,
    ...(headers !== undefined ? { headers } : {}),
    fetch: (input, init) => handler(new Request(input, init)),
  });
}

async function post(handler: (r: Request) => Promise<Response>, body: string, type = "application/json") {
  const response = await handler(
    new Request(URL_, { method: "POST", headers: { "content-type": type }, body }),
  );
  return { status: response.status, text: await response.text(), response };
}

describe("createRPCFetchHandler + createRPCHttpTransport", () => {
  it("calls a procedure end to end", async () => {
    const client = new RPCClient(wired(createRPCFetchHandler(buildServer())));
    await expect(client.call("math.add", { a: 4, b: 5 })).resolves.toBe(9);
  });

  it("maps unknown procedures and validation failures to typed errors and statuses", async () => {
    const handler = createRPCFetchHandler(buildServer());
    const client = new RPCClient(wired(handler));

    await expect(client.call("math.nope", {})).rejects.toBeInstanceOf(RPCProcedureNotFoundError);
    const invalid = await client.call("math.add", { a: "x" }).catch((e: unknown) => e);
    expect(invalid).toBeInstanceOf(RPCValidationError);

    const frame = JSON.stringify(createRPCRequest({ id: "r1", procedure: "math.nope", payload: {} }));
    expect((await post(handler, frame)).status).toBe(404);
  });

  it("never sends internal messages or stack traces", async () => {
    const seen: unknown[] = [];
    const handler = createRPCFetchHandler(buildServer((e) => seen.push(e)));
    const frame = JSON.stringify(createRPCRequest({ id: "r2", procedure: "db.query", payload: {} }));
    const { status, text } = await post(handler, frame);

    expect(status).toBe(500);
    expect(text).toContain(INTERNAL_ERROR_MESSAGE);
    expect(text).not.toContain("secret-connection-string");
    expect(text).not.toMatch(/\bat .*\.ts/);
    expect(seen).toHaveLength(1);
  });

  it("answers malformed HTTP requests with RPC error frames", async () => {
    const handler = createRPCFetchHandler(buildServer(), { maxBodyBytes: 64 });

    const get = await handler(new Request(URL_, { method: "GET" }));
    expect(get.status).toBe(400);
    expect(get.headers.get("allow")).toBe("POST");

    expect(JSON.parse((await post(handler, "{}", "text/plain")).text).error.code).toBe(
      "RPC_INVALID_REQUEST",
    );
    const bad = await post(handler, "{not json");
    expect(JSON.parse(bad.text).error.code).toBe("RPC_DESERIALIZATION_ERROR");
    const big = await post(handler, JSON.stringify({ pad: "x".repeat(200) }));
    expect(JSON.parse(big.text).error.message).toContain("exceeds 64 bytes");
    expect(big.response.headers.get("content-type")).toContain("application/json");
  });

  it("derives trusted auth from the request through the auth hook", async () => {
    const handler = createRPCFetchHandler(buildServer(), {
      auth: (request) => {
        const token = request.headers.get("authorization");
        if (token === "Bearer nope") throw new RPCAuthenticationError("Bad token.");
        if (token === "Bearer boom") throw new Error("verifier crashed: key=abc");
        return token === null ? undefined : { token };
      },
    });

    const ok = new RPCClient(wired(handler, { authorization: "Bearer good" }));
    await expect(ok.call("who.ami", {})).resolves.toEqual({ token: "Bearer good" });

    const denied = new RPCClient(wired(handler, { authorization: "Bearer nope" }));
    const error = (await denied.call("who.ami", {}).catch((e: unknown) => e)) as RPCError;
    expect(error).toBeInstanceOf(RPCAuthenticationError);
    expect(error.message).toBe("Bad token.");

    const crashed = new RPCClient(wired(handler, { authorization: "Bearer boom" }));
    const internal = (await crashed.call("who.ami", {}).catch((e: unknown) => e)) as RPCError;
    expect(internal.message).toBe(INTERNAL_ERROR_MESSAGE);
  });

  it("rebuilds forbidden errors from the wire", async () => {
    const server = new RPCServer();
    server.register(
      createRPCProcedure("admin.purge", async () => {
        throw new RPCForbiddenError("Admins only.");
      }),
    );
    const client = new RPCClient(wired(createRPCFetchHandler(server)));
    await expect(client.call("admin.purge", {})).rejects.toBeInstanceOf(RPCForbiddenError);
  });
});

describe("createRPCHttpTransport failure typing", () => {
  it("reports a non-RPC reply as an RPCTransportError", async () => {
    const transport = createRPCHttpTransport({
      url: URL_,
      fetch: async () => new Response("<html>Bad gateway</html>", { status: 502 }),
    });
    const error = await new RPCClient(transport).call("math.add", {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RPCTransportError);
    expect((error as Error).message).toContain("HTTP 502");
  });

  it("reports a network failure as an RPCTransportError", async () => {
    const transport = createRPCHttpTransport({
      url: URL_,
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
    });
    await expect(new RPCClient(transport).call("math.add", {})).rejects.toBeInstanceOf(
      RPCTransportError,
    );
  });

  it("rejects a reply to a different request id", async () => {
    const transport = createRPCHttpTransport({
      url: URL_,
      fetch: async () => Response.json({ id: "someone-else", success: true, result: 1 }),
    });
    await expect(new RPCClient(transport).call("math.add", {})).rejects.toBeInstanceOf(
      RPCTransportError,
    );
  });

  it("rejects an oversized reply", async () => {
    const transport = createRPCHttpTransport({
      url: URL_,
      maxResponseBytes: 16,
      fetch: async () => new Response("x".repeat(100)),
    });
    await expect(new RPCClient(transport).call("math.add", {})).rejects.toBeInstanceOf(
      RPCTransportError,
    );
  });

  it("aborts the fetch on timeout and on caller cancel", async () => {
    let aborted = 0;
    const hanging = createRPCHttpTransport({
      url: URL_,
      fetch: (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            aborted += 1;
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    });

    const timed = new RPCClient(hanging, { timeout: 20 });
    await expect(timed.call("slow.call", {})).rejects.toBeInstanceOf(RPCTimeoutError);

    const controller = new AbortController();
    const pending = new RPCClient(hanging).call("slow.call", {}, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(RPCCancelledError);
    expect(aborted).toBe(2);
  });
});

describe("over a real socket with the global fetch", () => {
  let http: Server | undefined;

  afterEach(async () => {
    await new Promise<void>((resolve) => (http ? http.close(() => resolve()) : resolve()));
    http = undefined;
  });

  it("serves and calls procedures", async () => {
    const handler = createRPCFetchHandler(buildServer());
    http = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const request = new Request(`http://localhost${req.url}`, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        ...(req.method === "POST" ? { body: Buffer.concat(chunks) } : {}),
      });
      const response = await handler(request);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(await response.text());
    });
    await new Promise<void>((resolve) => http!.listen(0, "127.0.0.1", resolve));
    const { port } = http.address() as AddressInfo;

    const client = new RPCClient(createRPCHttpTransport({ url: `http://127.0.0.1:${port}/rpc` }));
    await expect(client.call("math.add", { a: 20, b: 22 })).resolves.toBe(42);
    await expect(client.call("math.nope", {})).rejects.toBeInstanceOf(RPCProcedureNotFoundError);
  });
});
