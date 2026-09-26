/**
 * Round 12 regressions for @zudojs/errors (academy findings #38, #39, #92,
 * #100, #111, #133).
 */

import { describe, expect, it } from "vitest";

import {
  AdapterConnectionError,
  AdapterTimeoutError,
  BaseError,
  ErrorCode,
  ErrorHandler,
  ErrorSerializer,
  ErrorSeverity,
  ExternalServiceError,
  MiddlewareError,
  MiddlewareRateLimitError,
  MiddlewareTimeoutError,
  RouteConflictError,
  SchemaError,
  ServiceUnavailableError,
  ValidationError,
  isErrorCode,
  serializePublicError,
} from "../src/index.js";

class CardDeclinedError extends BaseError {
  constructor() {
    super("Card declined", {
      code: "PAYMENT_CARD_DECLINED",
      statusCode: 402,
      expose: true,
      metadata: { declineCode: "do_not_honor", processorRef: "psp_123" },
    });
  }
}

describe("#38 exposed errors no longer publish their metadata by default", () => {
  it("serializePublicError omits metadata for an exposed error", () => {
    const body = serializePublicError(new CardDeclinedError());
    expect(body.message).toBe("Card declined");
    expect(body).not.toHaveProperty("metadata");
  });

  it("ErrorHandler.toPublicResult omits details for an exposed error", () => {
    const result = new ErrorHandler().toPublicResult(new CardDeclinedError());
    expect(result).not.toHaveProperty("details");
  });

  it("publicMetadataKeys still allow-lists keys", () => {
    const body = serializePublicError(new CardDeclinedError(), {
      publicMetadataKeys: ["declineCode"],
    });
    expect(body.metadata).toEqual({ declineCode: "do_not_honor" });
  });

  it("exposeMetadata restores the old behaviour, redacted", () => {
    const error = new BaseError("x", {
      statusCode: 400,
      metadata: { password: "p", ok: 1 },
    });
    expect(serializePublicError(error, { exposeMetadata: true }).metadata).toEqual({
      password: "[REDACTED]",
      ok: 1,
    });
    expect(
      new ErrorHandler({ exposeMetadata: true }).toPublicResult(error).details,
    ).toEqual({ password: "[REDACTED]", ok: 1 });
  });

  it("exposeMetadata never publishes metadata of a non-exposed error", () => {
    const error = new BaseError("x", { statusCode: 500, metadata: { host: "db1" } });
    expect(serializePublicError(error, { exposeMetadata: true })).not.toHaveProperty(
      "metadata",
    );
  });

  it("publicMetadataKeys wins over exposeMetadata", () => {
    const body = new ErrorSerializer({
      exposeMetadata: true,
      publicMetadataKeys: ["declineCode"],
    }).serializePublic(new CardDeclinedError());
    expect(body.metadata).toEqual({ declineCode: "do_not_honor" });
  });
});

describe("#111 public serialization keeps validation issues", () => {
  const issues = [
    { path: ["email"], code: "invalid_format", message: "Invalid email", value: "a@b" },
    { path: ["password"], code: "too_short", message: "Too short", received: "hunter2" },
  ];

  it("includes ValidationError.issues with submitted values redacted", () => {
    const body = serializePublicError(new ValidationError("Validation failed.", { issues }));
    expect(body.issues).toEqual([
      { path: ["email"], code: "invalid_format", message: "Invalid email", valueType: "string(3)" },
      { path: ["password"], code: "too_short", message: "Too short", receivedType: "string(7)" },
    ]);
    expect(JSON.stringify(body)).not.toContain("hunter2");
  });

  it("includes SchemaError.issues and ErrorHandler exposes them too", () => {
    const error = new SchemaError("Validation failed", { issues });
    expect(serializePublicError(error).issues).toHaveLength(2);
    expect(new ErrorHandler().toPublicResult(error).issues).toHaveLength(2);
  });

  it("drops issues of a non-exposed error and omits empty lists", () => {
    const hidden = new ValidationError("x", { issues, expose: false });
    expect(serializePublicError(hidden)).not.toHaveProperty("issues");
    expect(serializePublicError(new ValidationError("x"))).not.toHaveProperty("issues");
  });
});

describe("#92 ExternalServiceError without options", () => {
  it("constructs instead of throwing a TypeError", () => {
    const error = new (ExternalServiceError as unknown as new (m: string) => ExternalServiceError)(
      "upstream failed",
    );
    expect(error.service).toBe("unknown");
    expect(error.code).toBe(ErrorCode.EXTERNAL_SERVICE);
    expect(error.statusCode).toBe(502);
    expect(error.metadata.service).toBe("unknown");
  });

  it("keeps a supplied service", () => {
    const error = new ExternalServiceError("m", { service: "stripe", operation: "charge" });
    expect(error.service).toBe("stripe");
    expect(error.operation).toBe("charge");
  });
});

describe("#133 ServiceUnavailableError", () => {
  it("exposes its message by default and still accepts expose: false", () => {
    const error = new ServiceUnavailableError("Down for maintenance until 03:00 UTC");
    expect(error.statusCode).toBe(503);
    expect(error.expose).toBe(true);
    expect(serializePublicError(error).message).toBe("Down for maintenance until 03:00 UTC");
    expect(new ServiceUnavailableError("secret", { expose: false }).expose).toBe(false);
  });

  it("does not publish metadata just because it is exposed", () => {
    const error = new ServiceUnavailableError("x", { metadata: { node: "db-1" } });
    expect(serializePublicError(error)).not.toHaveProperty("metadata");
  });
});

describe("#39 error codes are an open set", () => {
  it("isErrorCode narrows a custom code back to the enum", () => {
    expect(isErrorCode(new CardDeclinedError().code)).toBe(false);
    expect(isErrorCode(new ValidationError().code)).toBe(true);
  });
});

describe("RouteConflictError custom message (HTTP group request)", () => {
  it("keeps the default duplicate-registration message", () => {
    const error = new RouteConflictError("/users/:id", "GET");
    expect(error.message).toBe("A route for GET /users/:id is already registered.");
    expect(error.code).toBe(ErrorCode.HTTP_ROUTE_CONFLICT);
    expect(error.metadata).toEqual({ path: "/users/:id", method: "GET" });
    expect(error.reason).toBeUndefined();
  });

  it("reason is reported and recorded", () => {
    const error = new RouteConflictError("/users/:slug", "GET", {
      reason: "shadowed by GET /users/:id",
    });
    expect(error.message).toBe(
      "A route for GET /users/:slug conflicts with an existing route: shadowed by GET /users/:id",
    );
    expect(error.reason).toBe("shadowed by GET /users/:id");
    expect(error.metadata.reason).toBe("shadowed by GET /users/:id");
    expect(error.code).toBe(ErrorCode.HTTP_ROUTE_CONFLICT);
  });

  it("message replaces the default entirely and cause is kept", () => {
    const cause = new Error("inner");
    const error = new RouteConflictError("/a", "POST", {
      message: "Route POST /a is unreachable.",
      reason: "shadowed",
      cause,
    });
    expect(error.message).toBe("Route POST /a is unreachable.");
    expect(error.cause).toBe(cause);
    expect(error.path).toBe("/a");
    expect(error.method).toBe("POST");
  });
});

describe("#48 middleware errors reach HTTP clients with the right status", () => {
  it("MiddlewareRateLimitError is an exposed 429 with Retry-After", () => {
    const error = new MiddlewareRateLimitError(5, 60000, 1234);
    expect(error).toBeInstanceOf(MiddlewareError);
    expect(error.statusCode).toBe(429);
    expect(error.expose).toBe(true);
    expect(error.code).toBe(ErrorCode.RATE_LIMITED);
    expect(error.severity).toBe(ErrorSeverity.WARNING);
    expect(error.headers).toEqual({ "retry-after": "2" });
    expect(error.metadata).toMatchObject({ limit: 5, windowMs: 60000, retryAfterMs: 1234 });
    expect(error.middlewareName).toBe("rate-limit");
    expect(serializePublicError(error).message).toBe(
      "Rate limit exceeded: 5 requests per 60000ms",
    );
  });

  it("Retry-After is never below one second and survives withMetadata", () => {
    expect(new MiddlewareRateLimitError(1, 1000, 0).headers["retry-after"]).toBe("1");
    expect(new MiddlewareRateLimitError(1, 1000, 999).headers["retry-after"]).toBe("1");
    expect(new MiddlewareRateLimitError(1, 1000, 1000).headers["retry-after"]).toBe("1");
    expect(new MiddlewareRateLimitError(1, 1000, 1001).headers["retry-after"]).toBe("2");
    expect(
      new MiddlewareRateLimitError(1, 1000, 1234).withMetadata({ a: 1 }).headers,
    ).toEqual({ "retry-after": "2" });
  });

  it("MiddlewareTimeoutError is a 504 that stays internal", () => {
    const error = new MiddlewareTimeoutError("auth", 10);
    expect(error.statusCode).toBe(504);
    expect(error.expose).toBe(false);
    expect(error.code).toBe(ErrorCode.MIDDLEWARE_TIMEOUT);
    expect(error.timeoutMs).toBe(10);
  });
});

describe("#100 adapter error statuses", () => {
  it("AdapterTimeoutError answers 504 and stays unexposed", () => {
    const error = new AdapterTimeoutError("pg", "query", 5000);
    expect(error.statusCode).toBe(504);
    expect(error.expose).toBe(false);
  });

  it("AdapterConnectionError answers 503 and stays unexposed", () => {
    const error = new AdapterConnectionError("redis");
    expect(error.statusCode).toBe(503);
    expect(error.expose).toBe(false);
  });
});
