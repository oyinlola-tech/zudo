/**
 * RPC and queue bindings: procedure shape, error mapping, auth and job
 * result handling.
 */
import { describe, expect, it } from "vitest";

import { createJobId, createJobName, type Job, type JobContext } from "@zudojs/queue";

import {
  createRPCMemoryTransport,
  RPCAuthenticationError,
  RPCClient,
  RPCError,
  RPCInternalError,
  RPCProcedureRegistry,
  RPCServer,
} from "@zudojs/rpc";

import {
  API_RPC_TIMEOUT_MARGIN_MS,
  APIAuthenticationError,
  apiErrorToRPCError,
  APIInternalError,
  APIRateLimitError,
  createApiQueueProcessor,
  createApiRpcProcedure,
  createAPIError,
  defineOperation,
  registerApiRpcProcedures,
} from "../src/index.js";

describe("RPC binding", () => {
  it("creates procedures carrying the operation's metadata and timeout", () => {
    const op = defineOperation({
      name: "users.list",
      timeout: 2_000,
      metadata: { description: "List users", idempotent: true },
      handler: async () => [],
    });
    const procedure = createApiRpcProcedure(op);
    expect(procedure.name).toBe("users.list");
    expect(procedure.options).toMatchObject({
      description: "List users",
      idempotent: true,
      timeout: 2_000 + API_RPC_TIMEOUT_MARGIN_MS,
    });
  });

  it("maps names and rejects names RPC cannot route", () => {
    const op = defineOperation({ name: "users/list", handler: async () => [] });
    const registry = new RPCProcedureRegistry();
    expect(() => registerApiRpcProcedures(registry, [op])).toThrow();
    expect(
      registerApiRpcProcedures(registry, [op], { procedureName: (o) => o.name.replace("/", ".") }),
    ).toEqual(["users.list"]);
  });

  it("derives state from the transport-verified auth", async () => {
    const op = defineOperation({
      name: "who.ami",
      handler: async (_input: unknown, context) => context.state,
    });
    const server = new RPCServer();
    registerApiRpcProcedures(server, [op], {
      state: (rpc) => {
        if (rpc.auth === undefined) throw new APIAuthenticationError("Sign in.");
        return { user: rpc.auth["userId"] };
      },
    });

    const anonymous = new RPCClient(createRPCMemoryTransport(server));
    await expect(anonymous.call("who.ami", {})).rejects.toBeInstanceOf(RPCAuthenticationError);

    const signedIn = new RPCClient(createRPCMemoryTransport(server, { auth: { userId: "u1" } }));
    await expect(signedIn.call("who.ami", {})).resolves.toEqual({ user: "u1" });
  });

  it("maps API errors onto RPC errors without exposing internal ones", () => {
    const internal = apiErrorToRPCError(new APIInternalError("db down"), "p.q");
    expect(internal).toBeInstanceOf(RPCInternalError);
    expect(internal.expose).toBe(false);

    const limited = apiErrorToRPCError(new APIRateLimitError("Slow down.", 3), "p.q");
    expect(limited.statusCode).toBe(429);

    const hidden = apiErrorToRPCError(createAPIError("secret", { code: "ERR_X", expose: false }), "p.q");
    expect(hidden).toBeInstanceOf(RPCError);
    expect(hidden.code).toBe("ERR_X");
    expect(hidden.expose).toBe(false);
    expect(hidden.cause).toBeDefined();
  });
});

describe("queue binding", () => {
  const job = (data: unknown): Job =>
    ({
      id: createJobId("job-1"),
      name: createJobName("x"),
      queueName: "q",
      data,
      metadata: { correlationId: "corr-1" },
    }) as unknown as Job;
  const context = { signal: new AbortController().signal } as JobContext;

  it("wraps output in a JobResult so a `success` field is not misread", async () => {
    const op = defineOperation({ name: "odd.shape", handler: async () => ({ success: false }) });
    const result = await createApiQueueProcessor(op)(job({}), context);
    expect(result).toMatchObject({ success: true, data: { success: false } });
  });

  it("throws a client-safe error and reports the original", async () => {
    const seen: string[] = [];
    const op = defineOperation({
      name: "db.write",
      handler: async () => {
        throw new Error("password=hunter2");
      },
    });
    const processor = createApiQueueProcessor(op, {
      onInternalError: (_error, requestId) => seen.push(requestId),
    });
    const error = (await processor(job({}), context).catch((e: unknown) => e)) as Error;
    expect(error.message).toBe("An internal error occurred.");
    expect(error.message).not.toContain("hunter2");
    expect(seen).toEqual(["job-1"]);
  });
});
