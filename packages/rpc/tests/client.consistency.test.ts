/**
 * Client behaviour reported from plain scripts: pending deadlines must keep
 * the process alive, rebuilt errors carry their wire code and `details`,
 * and exposable `@zudojs/errors` errors keep their meaning over the wire.
 */
import { describe, expect, it } from "vitest";

import {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from "@zudojs/errors";

import {
  createRPCMemoryTransport,
  createRPCProcedure,
  INTERNAL_ERROR_MESSAGE,
  retry,
  RPCCancelledError,
  RPCClient,
  RPCError,
  RPCServer,
  RPCTimeoutError,
  RPCUnavailableError,
  RPCValidationError,
  type RPCResponse,
} from "../src/index.js";

const liveTimers = (): number =>
  process.getActiveResourcesInfo().filter((kind) => kind === "Timeout").length;

describe("timers that guard pending work keep the process alive", () => {
  it("a pending call's deadline is a ref'd timer and still rejects", async () => {
    const before = liveTimers();
    const client = new RPCClient({ send: () => new Promise<RPCResponse>(() => undefined) }, { timeout: 100 });
    const call = client.call("x.y", {});
    const during = liveTimers();

    await expect(call).rejects.toBeInstanceOf(RPCTimeoutError);
    expect(during).toBeGreaterThan(before);
    expect(liveTimers()).toBeLessThan(during);
  });

  it("a retry backoff is a ref'd timer", async () => {
    let tries = 0;
    const before = liveTimers();
    const pending = retry(
      async () => {
        tries += 1;
        if (tries === 1) throw new Error("flaky");
        return "ok";
      },
      { attempts: 2, delay: 50, jitter: "none" },
    );
    await new Promise((resolve) => setImmediate(resolve));
    const during = liveTimers();

    await expect(pending).resolves.toBe("ok");
    expect(during).toBeGreaterThan(before);
  });
});

function serverWith(error: () => unknown): RPCClient {
  const server = new RPCServer();
  server.register(
    createRPCProcedure("x.fail", async () => {
      throw error();
    }),
  );
  return new RPCClient(createRPCMemoryTransport(server));
}

async function failure(client: RPCClient): Promise<RPCError> {
  return (await client.call("x.fail", {}).catch((error: unknown) => error)) as RPCError;
}

describe("client error codes are the wire codes", () => {
  it.each([
    ["RPC_TIMEOUT", () => new RPCTimeoutError(5, "x.fail"), RPCTimeoutError],
    ["RPC_CANCELLED", () => new RPCCancelledError("stopped", "x.fail"), RPCCancelledError],
    ["RPC_UNAVAILABLE", () => new RPCUnavailableError("down", "x.fail"), RPCUnavailableError],
    ["RPC_VALIDATION_ERROR", () => new RPCValidationError("bad", [], "x.fail"), RPCValidationError],
  ] as const)("%s from the server keeps its wire code and class", async (code, make, type) => {
    const error = await failure(serverWith(make));
    expect(error).toBeInstanceOf(type);
    expect(error.code).toBe(code);
  });

  it("uses the wire code for the client's own deadline and cancellation too", async () => {
    const hang = new RPCClient({ send: () => new Promise<RPCResponse>(() => undefined) }, { timeout: 20 });
    const timedOut = (await hang.call("x.y", {}).catch((e: unknown) => e)) as RPCError;
    expect(timedOut).toBeInstanceOf(RPCTimeoutError);
    expect(timedOut.code).toBe("RPC_TIMEOUT");

    const controller = new AbortController();
    const pending = hang.call("x.y", {}, { signal: controller.signal, timeout: 0 });
    controller.abort();
    const cancelled = (await pending.catch((e: unknown) => e)) as RPCError;
    expect(cancelled).toBeInstanceOf(RPCCancelledError);
    expect(cancelled.code).toBe("RPC_CANCELLED");
  });
});

describe("RPCError.details", () => {
  it("is declared and preserved on rebuilt errors", async () => {
    const error = await failure(serverWith(() => new RPCError("quota", { code: "QUOTA", expose: true })));
    const typed: { readonly details?: unknown } = error;
    expect(typed.details).toBeUndefined();

    const limited = await failure(
      serverWith(() => new RateLimitError("slow down", { retryAfterSeconds: 7 })),
    );
    expect(limited.details).toEqual({ retryAfter: 7 });
    expect(new RPCError("x", { details: { a: 1 } }).details).toEqual({ a: 1 });
  });
});

describe("exposable @zudojs/errors errors map to RPC codes", () => {
  it.each([
    ["RPC_NOT_FOUND", () => new NotFoundError("Order 42 was not found.")],
    ["RPC_VALIDATION_ERROR", () => new ValidationError("Quantity must be positive.")],
    ["RPC_UNAUTHENTICATED", () => new AuthenticationError("Sign in first.")],
    ["RPC_FORBIDDEN", () => new AuthorizationError("Not your order.")],
    ["RPC_CONFLICT", () => new ConflictError("Order already shipped.")],
    ["RPC_RATE_LIMITED", () => new RateLimitError("Too many orders.")],
  ] as const)("%s with the error's own message", async (code, make) => {
    const error = await failure(serverWith(make));
    expect(error.code).toBe(code);
    expect(error.message).toBe(make().message);
  });

  it("keeps a non-exposed error internal", async () => {
    const internal: unknown[] = [];
    const server = new RPCServer(undefined, undefined, { onInternalError: (e) => internal.push(e) });
    server.register(
      createRPCProcedure("x.fail", async () => {
        throw new NotFoundError("row 42 in shard db-7 missing", { expose: false });
      }),
    );
    const response = await server.handle({ id: "r1", procedure: "x.fail", payload: {}, metadata: {} } as never);
    expect(response.error).toEqual({ code: "RPC_INTERNAL_ERROR", message: INTERNAL_ERROR_MESSAGE });
    expect(internal).toHaveLength(1);
  });
});
