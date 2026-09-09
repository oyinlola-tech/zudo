import { describe, expect, it } from "vitest";

import { RPCServer } from "../src/rpc/server/rpcServer.core.js";

import { createRPCProcedure } from "../src/rpc/procedure/rpcProcedure.type.js";

import { createRPCRequest } from "../src/rpc/types/rpcRequest.type.js";

describe("RPCServer", () => {
  it("registers and dispatches a procedure", async () => {
    const server = new RPCServer();
    server.register(
      createRPCProcedure<{ id: string }, { id: string; name: string }>(
        "users.get",
        async (input) => {
          return { id: input.id, name: "Alice" };
        },
      ),
    );

    const request = createRPCRequest({
      id: "req-1",
      procedure: "users.get",
      payload: { id: "123" },
    });

    const response = await server.handle(request);

    expect(response.success).toBe(true);
    if (response.success) {
      expect(response.result).toEqual({ id: "123", name: "Alice" });
    }
  });

  it("returns an error response for unknown procedures", async () => {
    const server = new RPCServer();
    const request = createRPCRequest({
      id: "req-1",
      procedure: "users.unknown",
      payload: {},
    });

    const response = await server.handle(request);

    expect(response.success).toBe(false);
    if (!response.success) {
      expect(response.error?.code).toBe("RPC_PROCEDURE_NOT_FOUND");
    }
  });
});
