/**
 * Helpers shared by the transports: error mapping, wire-error rebuilding,
 * status mapping, bounded body reads and the frame guard.
 */
import { describe, expect, it } from "vitest";

import {
  INTERNAL_ERROR_MESSAGE,
  isRPCResponseFrame,
  mapRPCError,
  readBoundedBody,
  RPCError,
  RPCInternalError,
  RPCRateLimitedError,
  rpcErrorFromWire,
  rpcHttpStatus,
  RPCTimeoutError,
  RPCValidationError,
} from "../src/index.js";

describe("mapRPCError", () => {
  it("withholds anything not built to be exposed", () => {
    expect(mapRPCError(new Error("boom"))).toEqual({
      payload: { code: "RPC_INTERNAL_ERROR", message: INTERNAL_ERROR_MESSAGE },
      internal: true,
    });
    expect(mapRPCError("string thrown").internal).toBe(true);
    expect(mapRPCError(new RPCInternalError("detail")).payload.message).toBe(INTERNAL_ERROR_MESSAGE);
    expect(mapRPCError(new RPCError("hidden", { code: "X" })).payload).toEqual({
      code: "RPC_INTERNAL_ERROR",
      message: INTERNAL_ERROR_MESSAGE,
    });
  });

  it("keeps wire codes, messages and details of typed errors", () => {
    const mapped = mapRPCError(new RPCValidationError("bad", [{ path: "a" }]));
    expect(mapped).toEqual({
      payload: { code: "RPC_VALIDATION_ERROR", message: "bad", details: [{ path: "a" }] },
      internal: false,
    });
    expect(mapRPCError(new RPCRateLimitedError("slow down", 3)).payload.details).toEqual({
      retryAfter: 3,
    });
    expect(mapRPCError(new RPCError("Quota.", { code: "QUOTA", expose: true })).payload).toEqual({
      code: "QUOTA",
      message: "Quota.",
    });
  });
});

describe("rpcErrorFromWire", () => {
  it("rebuilds typed errors and preserves the wire code", () => {
    const validation = rpcErrorFromWire(
      { code: "RPC_VALIDATION_ERROR", message: "bad", details: [{ path: "a" }] },
      "math.add",
    );
    expect(validation).toBeInstanceOf(RPCValidationError);
    expect(validation.code).toBe("RPC_VALIDATION_ERROR");
    expect((validation as RPCValidationError).issues).toEqual([{ path: "a" }]);

    const limited = rpcErrorFromWire(
      { code: "RPC_RATE_LIMITED", message: "later", details: { retryAfter: 5 } },
      "p.q",
    );
    expect((limited as RPCRateLimitedError).retryAfterSeconds).toBe(5);

    const timeout = rpcErrorFromWire({ code: "RPC_TIMEOUT", message: "late" }, "p.q");
    expect(timeout).toBeInstanceOf(RPCTimeoutError);
    expect(timeout.message).toBe("late");

    const custom = rpcErrorFromWire({ code: "QUOTA", message: "Quota.", details: 1 }, "p.q");
    expect(custom.code).toBe("QUOTA");
    expect((custom as RPCError & { details: unknown }).details).toBe(1);
  });
});

describe("rpcHttpStatus", () => {
  it("maps wire codes to HTTP statuses", () => {
    expect(rpcHttpStatus({ id: "", success: true, result: 1 })).toBe(200);
    const status = (code: string) =>
      rpcHttpStatus({ id: "", success: false, error: { code, message: "" } });
    expect(status("RPC_PROCEDURE_NOT_FOUND")).toBe(404);
    expect(status("RPC_VALIDATION_ERROR")).toBe(422);
    expect(status("RPC_UNAUTHENTICATED")).toBe(401);
    expect(status("RPC_TIMEOUT")).toBe(504);
    expect(status("CUSTOM")).toBe(500);
  });
});

describe("readBoundedBody", () => {
  it("refuses a declared oversized body without reading it", async () => {
    const request = new Request("http://x/", {
      method: "POST",
      body: "x".repeat(10),
      headers: { "content-length": "999" },
    });
    await expect(readBoundedBody(request, 100)).resolves.toEqual({ ok: false, reason: "too-large" });
  });

  it("stops a streamed body at the limit", async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(64));
      },
    });
    const result = await readBoundedBody({ body: stream, headers: new Headers() }, 200);
    expect(result).toEqual({ ok: false, reason: "too-large" });
  });

  it("reads text and rejects invalid UTF-8", async () => {
    await expect(readBoundedBody(new Response("héllo"), 100)).resolves.toEqual({
      ok: true,
      text: "héllo",
    });
    await expect(readBoundedBody(new Response(new Uint8Array([0xff, 0xfe])), 100)).resolves.toEqual({
      ok: false,
      reason: "unreadable",
    });
  });
});

describe("isRPCResponseFrame", () => {
  it("accepts frames and rejects everything else", () => {
    expect(isRPCResponseFrame({ id: "a", success: true })).toBe(true);
    expect(isRPCResponseFrame({ id: "a", success: false, error: { code: "X", message: "m" } })).toBe(true);
    expect(isRPCResponseFrame({ id: "a", success: false })).toBe(false);
    expect(isRPCResponseFrame([])).toBe(false);
    expect(isRPCResponseFrame("<html>")).toBe(false);
  });
});
