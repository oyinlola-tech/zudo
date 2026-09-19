import { describe, expect, it } from "vitest";

import { schema } from "@zudojs/schema";

import {
  createRPCProcedure,
  createRPCRequest,
  RPCAuthenticationError,
  RPCMiddlewareStack,
  RPCServer,
  type RPCContext,
} from "../src/index.js";

describe("edge/RPC-01", () => {
  const whoami = createRPCProcedure(
    "auth.whoami",
    async (_input: unknown, context: RPCContext) => context.auth?.["userId"],
  );
  const stack = new RPCMiddlewareStack([
    async (context, next) => {
      if (typeof context.auth?.["userId"] !== "string") {
        throw new RPCAuthenticationError("Sign in first.");
      }
      return next();
    },
  ]);
  const server = new RPCServer(undefined, stack).register(whoami);

  it("caller-supplied metadata.userId does not authenticate", async () => {
    const response = await server.handle(
      createRPCRequest({
        id: "r1",
        procedure: "auth.whoami",
        payload: null,
        metadata: { userId: "admin" },
      }),
    );

    expect(response.success).toBe(false);
    expect(response.error?.code).toBe("RPC_UNAUTHENTICATED");
  });

  it("transport-supplied auth reaches middleware and handler, frozen", async () => {
    const response = await server.handle(
      createRPCRequest({ id: "r2", procedure: "auth.whoami", payload: null }),
      { auth: { userId: "u1" } },
    );

    expect(response).toMatchObject({ success: true, result: "u1" });
  });
});

describe("edge/RPC-02", () => {
  it("middleware sees the schema-parsed input on context.input", async () => {
    const seen: unknown[] = [];
    const stack = new RPCMiddlewareStack([
      async (context, next) => {
        seen.push(context.input, context.request.payload);
        return next();
      },
    ]);
    const server = new RPCServer(undefined, stack).register(
      createRPCProcedure(
        "tenant.read",
        async (input: { tenantId: string }) => input.tenantId,
        { input: schema.object({ tenantId: schema.string().trim() }) },
      ),
    );

    const response = await server.handle(
      createRPCRequest({
        id: "r3",
        procedure: "tenant.read",
        payload: { tenantId: "  t1  ", extra: "drop-me" },
      }),
    );

    expect(response).toMatchObject({ success: true, result: "t1" });
    expect(seen[0]).toEqual({ tenantId: "t1" });
    expect(seen[1]).toEqual({ tenantId: "  t1  ", extra: "drop-me" });
  });
});
