import { describe, expect, it } from "vitest";

import {
  assertValidRequest,
  createRPCProcedure,
  createRPCRequest,
  MAX_RPC_REQUEST_ID_LENGTH,
  RPCInvalidRequestError,
  RPCServer,
} from "../src/index.js";

describe("API-01 — request frame size is bounded across id, metadata and payload", () => {
  const frame = (overrides: Record<string, unknown>): unknown => ({
    id: "r1",
    procedure: "echo.it",
    payload: {},
    metadata: {},
    timestamp: 0,
    ...overrides,
  });

  it("rejects an id longer than MAX_RPC_REQUEST_ID_LENGTH", () => {
    expect(() =>
      assertValidRequest(
        frame({ id: "x".repeat(MAX_RPC_REQUEST_ID_LENGTH + 1) }),
      ),
    ).toThrow(RPCInvalidRequestError);
  });

  it("accepts an id exactly at the limit", () => {
    expect(() =>
      assertValidRequest(frame({ id: "x".repeat(MAX_RPC_REQUEST_ID_LENGTH) })),
    ).not.toThrow();
  });

  it("counts metadata toward the frame size limit", () => {
    expect(() =>
      assertValidRequest(frame({ metadata: { junk: "x".repeat(4096) } }), {
        maxPayloadBytes: 1024,
      }),
    ).toThrow(RPCInvalidRequestError);
  });

  it("counts payload and metadata together, not each in isolation", () => {
    expect(() =>
      assertValidRequest(
        frame({
          payload: { a: "x".repeat(700) },
          metadata: { b: "x".repeat(700) },
        }),
        { maxPayloadBytes: 1024 },
      ),
    ).toThrow(RPCInvalidRequestError);
  });

  it("still accepts a frame inside the limit", () => {
    expect(() =>
      assertValidRequest(
        frame({ payload: { a: "x".repeat(100) }, metadata: { b: "y" } }),
        { maxPayloadBytes: 1024 },
      ),
    ).not.toThrow();
  });

  it("does not reflect an oversized id back into the error response", async () => {
    let handlerRuns = 0;
    const server = new RPCServer().register(
      createRPCProcedure("echo.it", () => {
        handlerRuns += 1;
        return "ok";
      }),
    );

    const huge = "x".repeat(200_000);
    const response = await server.handle(
      createRPCRequest({ id: huge, procedure: "echo.it", payload: {} }),
    );

    expect(handlerRuns).toBe(0);
    expect(response.success).toBe(false);
    expect(response.error?.code).toBe("RPC_INVALID_REQUEST");
    expect(response.id.length).toBeLessThanOrEqual(MAX_RPC_REQUEST_ID_LENGTH);
    expect(response.error?.message).not.toContain(huge);
  });

  it("an oversized metadata frame never reaches the handler", async () => {
    let seen: unknown;
    const server = new RPCServer().register(
      createRPCProcedure("echo.it", (_input, context) => {
        seen = context.metadata;
        return "ok";
      }),
    );

    const response = await server.handle(
      createRPCRequest({
        id: "r1",
        procedure: "echo.it",
        payload: {},
        metadata: { junk: "x".repeat(2 * 1024 * 1024) },
      }),
    );

    expect(seen).toBeUndefined();
    expect(response.success).toBe(false);
    expect(response.error?.code).toBe("RPC_INVALID_REQUEST");
  });
});
