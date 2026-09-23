import { describe, expect, it } from "vitest";
import {
  GUARD_RESPONSE,
  createGuardResponse,
  isGuardResponse,
} from "../src/index.js";

describe("guard response contract", () => {
  it("brands a response with a registered symbol", () => {
    const response = createGuardResponse({
      status: 403,
      body: { error: "Forbidden" },
    });
    expect(response[GUARD_RESPONSE]).toBe(true);
    expect(GUARD_RESPONSE).toBe(Symbol.for("zudojs.middleware.guardResponse"));
    expect(isGuardResponse(response)).toBe(true);
    expect(Object.isFrozen(response)).toBe(true);
    expect(Object.isFrozen(response.headers)).toBe(true);
  });

  it("defaults a JSON content type for a structured body only", () => {
    expect(
      createGuardResponse({ status: 400, body: { error: "x" } }).headers,
    ).toEqual({ "content-type": "application/json; charset=utf-8" });
    expect(createGuardResponse({ status: 401 }).headers).toEqual({});
    expect(createGuardResponse({ status: 400, body: "plain" }).headers).toEqual(
      {},
    );
  });

  it("keeps a caller's content type and lower-cases header names", () => {
    const response = createGuardResponse({
      status: 401,
      body: { error: "Unauthorized" },
      headers: { "WWW-Authenticate": "Bearer", "Content-Type": "application/problem+json" },
    });
    expect(response.headers).toEqual({
      "www-authenticate": "Bearer",
      "content-type": "application/problem+json",
    });
  });

  it("never treats an unbranded object as a guard response", () => {
    expect(isGuardResponse({ status: 403, body: {}, headers: {} })).toBe(false);
    expect(
      isGuardResponse(JSON.parse(JSON.stringify(createGuardResponse({ status: 403 })))),
    ).toBe(false);
    expect(isGuardResponse(null)).toBe(false);
    expect(isGuardResponse("403")).toBe(false);
    expect(isGuardResponse({ [GUARD_RESPONSE]: true, status: 42 })).toBe(false);
  });

  it("rejects an invalid status or header value", () => {
    expect(() => createGuardResponse({ status: 42 })).toThrow(RangeError);
    expect(() => createGuardResponse({ status: 403.5 })).toThrow(RangeError);
    expect(() =>
      createGuardResponse({
        status: 403,
        headers: { "x-n": 1 as unknown as string },
      }),
    ).toThrow(TypeError);
  });
});
