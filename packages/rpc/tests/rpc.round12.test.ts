import { describe, expect, it } from "vitest";

import {
  RPCServer,
  RPCTimeoutError,
  RPCTransportError,
  RPCUnavailableError,
  UNAVAILABLE_ERROR_MESSAGE,
  createRPCProcedure,
  createRPCRequest,
  mapRPCError,
  retry,
} from "../src/index.js";

function request(procedure: string) {
  return createRPCRequest({ id: "req-1", procedure, payload: {} });
}

describe("#125 downstream failures inside a handler map to RPC_UNAVAILABLE", () => {
  it("maps a downstream RPCTransportError and withholds its text", async () => {
    const internal: unknown[] = [];
    const server = new RPCServer(undefined, undefined, {
      onInternalError: (error) => internal.push(error),
    });
    const transport = new RPCTransportError(
      "RPC HTTP request failed. https://billing.internal:8443",
      "billing.charge",
    );
    server.register(
      createRPCProcedure("orders.place", async () => {
        throw transport;
      }),
    );

    const response = await server.handle(request("orders.place"));

    expect(response.success).toBe(false);
    expect(response.error).toEqual({
      code: "RPC_UNAVAILABLE",
      message: UNAVAILABLE_ERROR_MESSAGE,
    });
    expect(internal).toHaveLength(1);
    expect(internal[0]).toBeInstanceOf(RPCUnavailableError);
    expect((internal[0] as Error).cause).toBe(transport);
  });

  it("maps a downstream RPCTimeoutError, not to this procedure's RPC_TIMEOUT", async () => {
    const server = new RPCServer();
    server.register(
      createRPCProcedure("orders.place", async () => {
        throw new RPCTimeoutError(5_000, "inventory.reserve");
      }),
    );

    const response = await server.handle(request("orders.place"));
    expect(response.error?.code).toBe("RPC_UNAVAILABLE");
  });

  it("keeps the procedure's own timeout as RPC_TIMEOUT, even when the handler rethrows it", async () => {
    const server = new RPCServer(undefined, undefined, {
      dispatch: { defaultTimeout: 20 },
    });
    server.register(
      createRPCProcedure("slow.hang", () => new Promise<never>(() => {})),
    );
    server.register(
      createRPCProcedure(
        "slow.cooperative",
        (_input, context) =>
          new Promise<never>((_, reject) => {
            context.signal.addEventListener("abort", () =>
              reject(context.signal.reason),
            );
          }),
      ),
    );

    expect((await server.handle(request("slow.hang"))).error?.code).toBe("RPC_TIMEOUT");
    expect((await server.handle(request("slow.cooperative"))).error?.code).toBe(
      "RPC_TIMEOUT",
    );
  });

  it("keeps a timeout a handler throws under its own procedure name as RPC_TIMEOUT", async () => {
    const server = new RPCServer();
    server.register(
      createRPCProcedure("reports.build", async () => {
        throw new RPCTimeoutError(50, "reports.build");
      }),
    );
    expect((await server.handle(request("reports.build"))).error?.code).toBe("RPC_TIMEOUT");
  });

  it("mapRPCError treats a bare transport error as unavailable and internal", () => {
    const mapped = mapRPCError(new RPCTransportError("socket hang up"));
    expect(mapped.payload).toEqual({
      code: "RPC_UNAVAILABLE",
      message: UNAVAILABLE_ERROR_MESSAGE,
    });
    expect(mapped.internal).toBe(true);

    const plain = mapRPCError(new RPCUnavailableError("Maintenance window."));
    expect(plain.payload.message).toBe("Maintenance window.");
    expect(plain.internal).toBe(false);
  });
});

describe("#132 retry attempts count calls", () => {
  it("attempts: 3 makes three calls in total; attempts: 1 never retries", async () => {
    let calls = 0;
    const failing = async (): Promise<never> => {
      calls += 1;
      throw new Error("down");
    };

    await expect(retry(failing, { attempts: 3, delay: 0 })).rejects.toThrow("down");
    expect(calls).toBe(3);

    calls = 0;
    await expect(retry(failing, { attempts: 1, delay: 0 })).rejects.toThrow("down");
    expect(calls).toBe(1);
  });
});
