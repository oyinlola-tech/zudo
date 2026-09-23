/**
 * In-memory transport: a real client calling a real server in-process.
 */
import { describe, expect, it } from "vitest";

import { schema } from "@zudojs/schema";

import {
  createRPCMemoryTransport,
  createRPCProcedure,
  INTERNAL_ERROR_MESSAGE,
  RPCCancelledError,
  RPCClient,
  RPCError,
  RPCProcedureNotFoundError,
  RPCServer,
  RPCTimeoutError,
  RPCUnavailableError,
  RPCValidationError,
  type RPCContext,
} from "../src/index.js";

function mathServer(onInternalError?: (error: unknown) => void): RPCServer {
  const server = new RPCServer(undefined, undefined, { onInternalError });
  server.register(
    createRPCProcedure(
      "math.add",
      async (input: { a: number; b: number }) => input.a + input.b,
      { input: schema.object({ a: schema.number(), b: schema.number() }) },
    ),
  );
  return server;
}

describe("createRPCMemoryTransport", () => {
  it("calls a registered procedure end to end", async () => {
    const client = new RPCClient(createRPCMemoryTransport(mathServer()));
    await expect(client.call("math.add", { a: 2, b: 3 })).resolves.toBe(5);
  });

  it("rejects an unknown procedure with a typed not-found error", async () => {
    const client = new RPCClient(createRPCMemoryTransport(mathServer()));
    const error = await client.call("math.nope", {}).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RPCProcedureNotFoundError);
    expect((error as RPCError).code).toBe("RPC_PROCEDURE_NOT_FOUND");
  });

  it("rejects invalid input with an RPCValidationError carrying the issues", async () => {
    const client = new RPCClient(createRPCMemoryTransport(mathServer()));
    const error = await client.call("math.add", { a: "x", b: 1 }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RPCValidationError);
    expect((error as RPCValidationError).code).toBe("RPC_VALIDATION_ERROR");
    expect((error as RPCValidationError).issues[0]).toMatchObject({ path: "a" });
  });

  it("hides an internal failure's message and stack from the caller", async () => {
    const seen: unknown[] = [];
    const server = mathServer((e) => seen.push(e));
    server.register(
      createRPCProcedure("db.query", async () => {
        throw new Error("password=hunter2 at /srv/db.ts:12");
      }),
    );
    const client = new RPCClient(createRPCMemoryTransport(server));
    const error = (await client.call("db.query", {}).catch((e: unknown) => e)) as RPCError;

    expect(error.message).toBe(INTERNAL_ERROR_MESSAGE);
    expect(JSON.stringify(error)).not.toContain("hunter2");
    expect(seen).toHaveLength(1);
  });

  it("isolates caller objects from the server by serializing frames", async () => {
    const server = new RPCServer();
    server.register(
      createRPCProcedure("obj.mutate", async (input: { list: number[] }) => {
        input.list.push(99);
        return input;
      }),
    );
    const payload = { list: [1] };
    const client = new RPCClient(createRPCMemoryTransport(server));

    await expect(client.call("obj.mutate", payload)).resolves.toEqual({ list: [1, 99] });
    expect(payload.list).toEqual([1]);
  });

  it("answers a result that cannot be serialized with a generic error frame", async () => {
    const server = new RPCServer();
    server.register(createRPCProcedure("big.int", async () => 10n));
    const client = new RPCClient(createRPCMemoryTransport(server));
    const error = (await client.call("big.int", {}).catch((e: unknown) => e)) as RPCError;

    expect(error.code).toBe("RPC_SERIALIZATION_ERROR");
    expect(error.message).toBe(INTERNAL_ERROR_MESSAGE);
  });

  it("passes frames by reference with serializer: false", async () => {
    const server = new RPCServer();
    server.register(createRPCProcedure("big.int", async () => 10n));
    const client = new RPCClient(createRPCMemoryTransport(server, { serializer: false }));

    await expect(client.call("big.int", {})).resolves.toBe(10n);
  });

  it("hands trusted auth to the server as context.auth", async () => {
    const server = new RPCServer();
    server.register(
      createRPCProcedure("who.ami", async (_input: unknown, context: RPCContext) => context.auth),
    );

    const fixed = new RPCClient(createRPCMemoryTransport(server, { auth: { userId: "u1" } }));
    await expect(fixed.call("who.ami", {})).resolves.toEqual({ userId: "u1" });

    const derived = new RPCClient(
      createRPCMemoryTransport(server, { auth: (request) => ({ via: request.procedure }) }),
    );
    await expect(derived.call("who.ami", {})).resolves.toEqual({ via: "who.ami" });
  });

  it("times out a slow procedure with an RPCTimeoutError", async () => {
    const server = new RPCServer();
    server.register(
      createRPCProcedure("slow.call", () => new Promise((resolve) => setTimeout(resolve, 500))),
    );
    const client = new RPCClient(createRPCMemoryTransport(server), { timeout: 20 });

    await expect(client.call("slow.call", {})).rejects.toBeInstanceOf(RPCTimeoutError);
  });

  it("cancels through the caller's signal", async () => {
    const server = new RPCServer();
    server.register(
      createRPCProcedure("slow.call", () => new Promise((resolve) => setTimeout(resolve, 500))),
    );
    const client = new RPCClient(createRPCMemoryTransport(server));
    const controller = new AbortController();
    const pending = client.call("slow.call", {}, { signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toBeInstanceOf(RPCCancelledError);
  });

  it("refuses sends after close()", async () => {
    const transport = createRPCMemoryTransport(mathServer());
    await transport.close?.();
    const client = new RPCClient(transport);

    await expect(client.call("math.add", { a: 1, b: 1 })).rejects.toBeInstanceOf(
      RPCUnavailableError,
    );
  });
});
