/**
 * Audit round 9 regressions.
 */
import { describe, expect, it } from "vitest";

import { schema } from "@zudojs/schema";

import {
  createRPCContext,
  createRPCProcedure,
  createRPCRequest,
  INTERNAL_ERROR_MESSAGE,
  parseOutput,
  RPCAuthenticationError,
  RPCClient,
  RPCDispatcher,
  RPCError,
  RPCInternalError,
  RPCMiddlewareStack,
  RPCProcedureRegistry,
  RPCSerializationError,
  RPCServer,
  RPCTimeoutError,
  type RPCRequest,
  type RPCResponse,
  type RPCTransportRequestOptions,
} from "../src/index.js";

function server(onInternalError?: (error: unknown, id: string) => void): RPCServer {
  return new RPCServer(undefined, undefined, { onInternalError });
}

/** A frame as a JSON transport would hand it over: no `metadata`. */
function bareFrame(procedure: string, payload: unknown): RPCRequest {
  return { id: "req-1", procedure, payload, timestamp: 0 } as RPCRequest;
}

describe("RPC-R9-01 a request without metadata is a valid frame", () => {
  it("dispatches through the server", async () => {
    const seen: unknown[] = [];
    const s = server((error) => seen.push(error));
    s.register(createRPCProcedure("echo.it", async (input: unknown) => input));

    const response = await s.handle(bareFrame("echo.it", 42));
    expect(response).toMatchObject({ success: true, result: 42 });
    expect(seen).toEqual([]);
  });

  it("gives middleware and handlers an object for context.metadata", async () => {
    const registry = new RPCProcedureRegistry();
    let observed: unknown = "unset";
    registry.register(
      createRPCProcedure("meta.read", async (_input, context) => {
        observed = context.metadata;
        return context.metadata["userId"] ?? null;
      }),
    );
    const dispatcher = new RPCDispatcher(registry, new RPCMiddlewareStack());
    const response = await dispatcher.dispatch(bareFrame("meta.read", null));
    expect(response.success).toBe(true);
    expect(observed).toEqual({});
  });

  it("createRPCContext defaults metadata to an empty object", () => {
    const context = createRPCContext(bareFrame("a.b", null), new AbortController().signal);
    expect(context.metadata).toEqual({});
  });
});

describe("RPC-R9-02 errors built with expose: false never put their message on the wire", () => {
  it("answers an RPCInternalError with the generic internal error and logs the detail", async () => {
    const seen: Error[] = [];
    const s = server((error) => seen.push(error as Error));
    s.register(
      createRPCProcedure("db.read", async () => {
        throw new RPCInternalError("connect to 10.0.0.5:5432 failed, password=hunter2");
      }),
    );

    const response = await s.handle(createRPCRequest({ id: "1", procedure: "db.read", payload: {} }));
    expect(response.error).toEqual({ code: "RPC_INTERNAL_ERROR", message: INTERNAL_ERROR_MESSAGE });
    expect(JSON.stringify(response)).not.toContain("hunter2");
    expect(seen[0]?.message).toContain("hunter2");
  });

  it("keeps the code of a custom RPCError subclass but hides a non-exposed message", async () => {
    class LedgerError extends RPCError {
      constructor() {
        super("ledger shard /var/lib/ledger/3 is corrupt", { code: "LEDGER_FAULT" });
      }
    }
    const seen: unknown[] = [];
    const s = server((error) => seen.push(error));
    s.register(
      createRPCProcedure("ledger.get", async () => {
        throw new LedgerError();
      }),
    );

    const response = await s.handle(createRPCRequest({ id: "1", procedure: "ledger.get", payload: {} }));
    expect(response.error).toEqual({ code: "LEDGER_FAULT", message: INTERNAL_ERROR_MESSAGE });
    expect(seen).toHaveLength(1);
  });

  it("still returns the message of a custom RPCError built with expose: true", async () => {
    class QuotaError extends RPCError {
      constructor() {
        super("Monthly quota exhausted.", { code: "QUOTA", expose: true });
      }
    }
    const s = server();
    s.register(
      createRPCProcedure("quota.use", async () => {
        throw new QuotaError();
      }),
    );

    const response = await s.handle(createRPCRequest({ id: "1", procedure: "quota.use", payload: {} }));
    expect(response.error).toEqual({ code: "QUOTA", message: "Monthly quota exhausted." });
  });

  it("keeps the serialization code but not the message", async () => {
    const seen: unknown[] = [];
    const s = server((error) => seen.push(error));
    s.register(
      createRPCProcedure("blob.get", async () => {
        throw new RPCSerializationError("cannot encode /srv/secrets/blob.bin");
      }),
    );

    const response = await s.handle(createRPCRequest({ id: "1", procedure: "blob.get", payload: {} }));
    expect(response.error).toEqual({ code: "RPC_SERIALIZATION_ERROR", message: INTERNAL_ERROR_MESSAGE });
    expect(seen).toHaveLength(1);
  });

  it("leaves framework-generated messages of typed errors intact", async () => {
    const s = server();
    s.register(
      createRPCProcedure("slow.op", () => new Promise<never>(() => {}), { timeout: 10 }),
    );
    const response = await s.handle(createRPCRequest({ id: "1", procedure: "slow.op", payload: {} }));
    expect(response.error?.code).toBe("RPC_TIMEOUT");
    expect(response.error?.message).toMatch(/timed out after 10ms/);
  });
});

describe("RPC-R9-03 an output-schema mismatch is a server fault, not a caller error", () => {
  const user = schema.object({ id: schema.string() });

  it("parseOutput throws RPCInternalError naming the failing path", () => {
    expect(() => parseOutput(user, { wrong: true }, "users.get")).toThrow(RPCInternalError);
    expect(() => parseOutput(user, { wrong: true }, "users.get")).toThrow(/id: /);
  });

  it("the server answers RPC_INTERNAL_ERROR and reports the detail", async () => {
    const seen: Error[] = [];
    const s = server((error) => seen.push(error as Error));
    s.register(
      createRPCProcedure("users.get", async () => ({ wrong: true }), { output: user as never }),
    );
    const response = await s.handle(createRPCRequest({ id: "1", procedure: "users.get", payload: {} }));
    expect(response.error).toEqual({ code: "RPC_INTERNAL_ERROR", message: INTERNAL_ERROR_MESSAGE });
    expect(seen[0]?.message).toContain('Procedure "users.get" produced a response');
  });

  it("an input failure still carries its issues, and no empty details otherwise", async () => {
    const s = server();
    s.register(
      createRPCProcedure("users.find", async (input: { id: string }) => input.id, {
        input: schema.object({ id: schema.string() }),
      }),
    );
    const bad = await s.handle(createRPCRequest({ id: "1", procedure: "users.find", payload: { id: 1 } }));
    expect(bad.error?.code).toBe("RPC_VALIDATION_ERROR");
    expect(Array.isArray(bad.error?.details)).toBe(true);
    expect((bad.error?.details as unknown[]).length).toBeGreaterThan(0);
  });
});

describe("RPC-R9-04 the client passes its deadline to the transport", () => {
  function capturing() {
    const calls: (RPCTransportRequestOptions | undefined)[] = [];
    const transport = {
      async send(_request: RPCRequest, options?: RPCTransportRequestOptions): Promise<RPCResponse> {
        calls.push(options);
        return { id: "x", success: true, result: null };
      },
    };
    return { transport, calls };
  }

  it("forwards the per-call timeout", async () => {
    const { transport, calls } = capturing();
    await new RPCClient(transport, { timeout: 1_000 }).call("a.b", {}, { timeout: 250 });
    expect(calls[0]?.timeout).toBe(250);
    expect(calls[0]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("forwards the client default when the call sets none", async () => {
    const { transport, calls } = capturing();
    await new RPCClient(transport, { timeout: 1_000 }).call("a.b", {});
    expect(calls[0]?.timeout).toBe(1_000);
  });

  it("omits the field when timeouts are disabled", async () => {
    const { transport, calls } = capturing();
    await new RPCClient(transport, { timeout: 0 }).call("a.b", {});
    expect(calls[0]).not.toHaveProperty("timeout");
  });
});

describe("RPC-R9-06 the README usage example runs against the real exports", () => {
  it("defines, registers, handles and calls math.sum as documented", async () => {
    const sum = createRPCProcedure(
      "math.sum",
      async (input: { a: number; b: number }) => input.a + input.b,
      { input: schema.object({ a: schema.number(), b: schema.number() }) },
    );

    const s = new RPCServer();
    s.register(sum);

    const response = await s.handle(
      createRPCRequest({ id: "req-1", procedure: "math.sum", payload: { a: 1, b: 2 } }),
    );
    expect(response).toEqual({ id: "req-1", success: true, result: 3 });

    const transport = { send: (request: RPCRequest) => s.handle(request) };
    const client = new RPCClient(transport, { timeout: 5_000 });
    const total = await client.call<{ a: number; b: number }, number>("math.sum", { a: 1, b: 2 });
    expect(total).toBe(3);

    const stack = new RPCMiddlewareStack([
      async (context, next) => {
        if (context.metadata.userId === undefined) {
          throw new RPCAuthenticationError("Sign in first.");
        }
        return next();
      },
    ]);
    const guarded = new RPCServer(undefined, stack);
    guarded.register(sum);
    const denied = await guarded.handle(
      createRPCRequest({ id: "req-2", procedure: "math.sum", payload: { a: 1, b: 2 } }),
    );
    expect(denied.error).toEqual({ code: "RPC_UNAUTHENTICATED", message: "Sign in first." });
  });
});

describe("RPC-R9-05 a server-side timeout keeps its message on the client", () => {
  it("rebuilds RPC_TIMEOUT as an RPCTimeoutError carrying the server's message", async () => {
    const client = new RPCClient({
      async send(): Promise<RPCResponse> {
        return {
          id: "x",
          success: false,
          error: { code: "RPC_TIMEOUT", message: "RPC operation timed out after 750ms." },
        };
      },
    });
    const error = await client.call("a.b", {}).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RPCTimeoutError);
    expect((error as Error).message).toBe("RPC operation timed out after 750ms.");
  });
});
