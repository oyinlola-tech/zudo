/**
 * Round-9 audit regression tests for @zudojs/errors.
 *
 * One describe block per finding id.
 */

import { describe, it, expect } from "vitest";

import {
  BaseError,
  ErrorHandler,
  ErrorSerializer,
  isSensitiveMetadataKey,
  redactErrorMetadata,
  sanitizeErrorMetadata,
  serializeError,
} from "../src/index.js";

describe("ERR-R9-01: a sensitive-key pattern with the g/y flag redacts on every call", () => {
  it("isSensitiveMetadataKey is stateless", () => {
    const pattern = /token/gi;
    expect([1, 2, 3, 4].map(() => isSensitiveMetadataKey("token", pattern))).toEqual(
      [true, true, true, true],
    );
    const sticky = /token/y;
    expect([1, 2].map(() => isSensitiveMetadataKey("token", sticky))).toEqual([
      true,
      true,
    ]);
  });

  it("redactErrorMetadata redacts consecutive calls with a shared /g pattern", () => {
    const pattern = /token/gi;
    const out = [1, 2, 3, 4].map(
      () =>
        redactErrorMetadata({ token: "s" }, { sensitiveKeyPattern: pattern })
          .token,
    );
    expect(out).toEqual(["[REDACTED]", "[REDACTED]", "[REDACTED]", "[REDACTED]"]);
  });

  it("sanitizeErrorMetadata({ redact: true }) is covered as well", () => {
    const pattern = /secret/g;
    const out = [1, 2, 3].map(
      () =>
        sanitizeErrorMetadata(
          { secret: "v" },
          { redact: true, sensitiveKeyPattern: pattern },
        ).secret,
    );
    expect(out).toEqual(["[REDACTED]", "[REDACTED]", "[REDACTED]"]);
  });

  it("ErrorSerializer and ErrorHandler configured once keep redacting", () => {
    const error = new BaseError("x", {
      metadata: { secret: "v" },
      statusCode: 400,
    });
    const serializer = new ErrorSerializer({ sensitiveKeyPattern: /secret/g });
    expect(
      [1, 2, 3].map(() => serializer.serializePublic(error).metadata?.secret),
    ).toEqual(["[REDACTED]", "[REDACTED]", "[REDACTED]"]);

    const handler = new ErrorHandler({ sensitiveKeyPattern: /secret/g });
    expect(
      [1, 2, 3].map(() => handler.toPublicResult(error).details?.secret),
    ).toEqual(["[REDACTED]", "[REDACTED]", "[REDACTED]"]);
  });
});

describe("ERR-R9-02: ErrorSerializer redacts plain-object causes", () => {
  it("redacts sensitive keys nested in an object cause", () => {
    const error = new BaseError("request failed", {
      cause: {
        request: { headers: { authorization: "Bearer abc", accept: "*/*" } },
        password: "hunter2",
      },
    });
    const serialized = serializeError(error, { includeCause: true });
    const cause = serialized.cause as Record<string, unknown>;
    expect(cause.password).toBe("[REDACTED]");
    const request = cause.request as Record<string, unknown>;
    const headers = request.headers as Record<string, unknown>;
    expect(headers.authorization).toBe("[REDACTED]");
    expect(headers.accept).toBe("*/*");
    expect(JSON.stringify(serialized)).not.toContain("Bearer abc");
    expect(JSON.stringify(serialized)).not.toContain("hunter2");
  });

  it("keeps the cause's shape: dates, arrays and class instances survive", () => {
    const when = new Date("2024-01-01T00:00:00.000Z");
    class Ref {
      readonly id = 7;
    }
    const error = new BaseError("x", {
      cause: { when, list: [{ token: "t" }, 1], ref: new Ref() },
    });
    const cause = serializeError(error, { includeCause: true })
      .cause as Record<string, unknown>;
    expect(cause.when).toBe(when);
    expect(cause.ref).toBeInstanceOf(Ref);
    expect(cause.list).toEqual([{ token: "[REDACTED]" }, 1]);
  });

  it("honours a custom sensitiveKeyPattern and redactSensitiveData: false", () => {
    const error = new BaseError("x", { cause: { ssnNumber: "1", token: "t" } });
    const custom = new ErrorSerializer({
      includeCause: true,
      sensitiveKeyPattern: /^ssn/,
    }).serialize(error).cause as Record<string, unknown>;
    expect(custom.ssnNumber).toBe("[REDACTED]");
    expect(custom.token).toBe("t");

    const raw = new ErrorSerializer({
      includeCause: true,
      redactSensitiveData: false,
    }).serialize(error).cause as Record<string, unknown>;
    expect(raw.token).toBe("t");
  });

  it("does not recurse forever on a cyclic object cause", () => {
    const cyclic: Record<string, unknown> = { name: "loop" };
    cyclic.self = cyclic;
    const error = new BaseError("x", { cause: cyclic });
    const cause = serializeError(error, { includeCause: true })
      .cause as Record<string, unknown>;
    expect(cause.self).toBe("[Circular]");
  });

  it("native error causes keep name and message", () => {
    const error = new BaseError("x", { cause: new TypeError("bad type") });
    const cause = serializeError(error, { includeCause: true })
      .cause as Record<string, unknown>;
    expect(cause.name).toBe("TypeError");
    expect(cause.message).toBe("bad type");
  });
});
