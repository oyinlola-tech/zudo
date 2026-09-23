/**
 * Post-release regressions: a non-exposed `RPCError` hid its message but
 * kept its custom code on the wire, so
 * `throw new RPCError("secret", { code: "TASK_SECRET" })` answered
 * `{ code: "TASK_SECRET", message: INTERNAL_ERROR_MESSAGE }`.
 */
import { describe, expect, it } from "vitest";

import {
  createRPCFetchHandler,
  createRPCProcedure,
  createRPCRequest,
  INTERNAL_ERROR_MESSAGE,
  mapRPCError,
  RPCError,
  RPCServer,
} from "../src/index.js";

function serverThrowing(error: Error, seen: unknown[] = []): RPCServer {
  const server = new RPCServer(undefined, undefined, {
    onInternalError: (caught) => seen.push(caught),
  });
  server.register(
    createRPCProcedure("task.run", async () => {
      throw error;
    }),
  );
  return server;
}

describe("a non-exposed RPCError never puts its custom code on the wire", () => {
  it("maps a custom code to RPC_INTERNAL_ERROR", () => {
    expect(mapRPCError(new RPCError("secret", { code: "TASK_SECRET" }))).toEqual({
      payload: { code: "RPC_INTERNAL_ERROR", message: INTERNAL_ERROR_MESSAGE },
      internal: true,
    });
  });

  it("maps the default RPCError code to RPC_INTERNAL_ERROR", () => {
    expect(mapRPCError(new RPCError("secret")).payload.code).toBe("RPC_INTERNAL_ERROR");
  });

  it("answers RPC_INTERNAL_ERROR through the server and reports the original", async () => {
    const seen: unknown[] = [];
    const error = new RPCError("secret", { code: "TASK_SECRET" });
    const server = serverThrowing(error, seen);

    const response = await server.handle(
      createRPCRequest({ id: "1", procedure: "task.run", payload: {} }),
    );

    expect(response.error).toEqual({
      code: "RPC_INTERNAL_ERROR",
      message: INTERNAL_ERROR_MESSAGE,
    });
    expect(JSON.stringify(response)).not.toContain("TASK_SECRET");
    expect(seen).toEqual([error]);
  });

  it("answers RPC_INTERNAL_ERROR with status 500 over HTTP", async () => {
    const handler = createRPCFetchHandler(
      serverThrowing(new RPCError("secret", { code: "TASK_SECRET" })),
    );

    const response = await handler(
      new Request("http://rpc.test/rpc", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "1", procedure: "task.run", payload: {}, timestamp: 0 }),
      }),
    );
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).not.toContain("TASK_SECRET");
    expect(JSON.parse(text).error.code).toBe("RPC_INTERNAL_ERROR");
  });

  it("keeps a standard wire code but still hides the message", () => {
    expect(
      mapRPCError(new RPCError("db pool drained", { code: "RPC_UNAVAILABLE" })).payload,
    ).toEqual({ code: "RPC_UNAVAILABLE", message: INTERNAL_ERROR_MESSAGE });
  });

  it("does not treat an inherited property name as a standard code", () => {
    expect(mapRPCError(new RPCError("x", { code: "toString" })).payload.code).toBe(
      "RPC_INTERNAL_ERROR",
    );
  });

  it("keeps the custom code and message of an exposed RPCError", () => {
    expect(
      mapRPCError(new RPCError("Quota used.", { code: "TASK_QUOTA", expose: true })).payload,
    ).toEqual({ code: "TASK_QUOTA", message: "Quota used." });
  });
});
