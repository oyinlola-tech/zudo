import { describe, it, expect } from "vitest";
import {
  BaseError,
  BASE_ERROR_BRAND,
  ErrorCategory,
  ErrorCode,
  ErrorSeverity,
  ErrorHandler,
  serializePublicError,
  serializeError,
  mapError,
  mapNativeError,
  mapErrorType,
  createErrorMappingRule,
  createErrorMapperRegistry,
  getErrorCategory,
  getErrorSeverity,
  isErrorCategory,
  isErrorSeverity,
  isErrorCode,
  isBaseError,
  toBaseError,
  normalizeToBaseError,
  normalizeUnknownError,
  normalizeError,
  sanitizeErrorMetadata,
  redactErrorMetadata,
  mergeErrorMetadata,
  createErrorMetadata,
  isErrorMetadataValue,
  isSensitiveMetadataKey,
  HttpClientAbortError,
  HttpClientNetworkError,
  HttpClientError,
  HttpNotFoundError,
  MethodNotAllowedError,
  InternalServerError,
  RequestBodyTooLargeError,
  TimeoutError,
  TimeoutOperation,
  databaseTimeoutError,
  requestTimeoutError,
  serviceTimeoutError,
  lockTimeoutError,
  ExternalServiceError,
  externalServiceUnavailableError,
  externalServiceUnavailable,
  networkServiceUnavailableError,
  isExternalServiceError,
  isNetworkError,
  RegistrationNotFoundError,
  DuplicateRegistrationError,
  AdapterNotFoundError,
  AdapterAlreadyRegisteredError,
  RoutePatternError,
  InvalidRoutePatternError,
  DuplicateRouteParameterError,
  isRoutePatternError,
  isHttpRouterError,
  storageNotFoundError,
  databaseMigrationError,
  CacheError,
  RuntimeError,
  cryptoSignatureError,
  CryptoOperation,
  databaseQueryError,
  AdapterTimeoutError,
} from "../src/index.js";

describe("audit round 6 — errors core", () => {
  describe("ERR-A-01 / ERR-A-19: public serialization hides internal metadata", () => {
    const dbError = databaseQueryError("boom", {
      driver: "pg",
      metadata: {
        sql: "SELECT * FROM users WHERE ssn='123'",
        host: "db.internal",
        nested: { Authorization: "Bearer x", apiKey: "k" },
      },
    });

    it("serializePublicError omits metadata for non-exposed errors", () => {
      const result = serializePublicError(dbError);
      expect(result.statusCode).toBe(500);
      expect(result.message).toBe("An unexpected error occurred.");
      expect(result).not.toHaveProperty("metadata");
    });

    it("serializePublicError allow-lists keys via publicMetadataKeys", () => {
      const result = serializePublicError(dbError, {
        publicMetadataKeys: ["host"],
      });
      expect(result.metadata).toEqual({ host: "db.internal" });
    });

    it("redaction is recursive and case-insensitive", () => {
      const exposed = new BaseError("x", {
        statusCode: 400,
        metadata: {
          Authorization: "Bearer x",
          headers: { cookie: "c", "x-api-key": "k", ok: "fine" },
          refreshToken: "r",
          list: [{ password: "p", id: 1 }],
        },
      });
      const result = serializePublicError(exposed);
      expect(result.metadata).toEqual({
        Authorization: "[REDACTED]",
        headers: { cookie: "[REDACTED]", "x-api-key": "[REDACTED]", ok: "fine" },
        refreshToken: "[REDACTED]",
        list: [{ password: "[REDACTED]", id: 1 }],
      });
    });

    it("ErrorHandler.toPublicResult exposes only safe fields", () => {
      const handler = new ErrorHandler();
      const result = handler.toPublicResult(dbError, { requestId: "r1" });
      expect(result).toEqual({
        code: ErrorCode.DATABASE_QUERY,
        message: "An unexpected error occurred.",
        statusCode: 500,
        requestId: "r1",
      });
      expect(result).not.toHaveProperty("category");
      expect(result).not.toHaveProperty("isOperational");
      expect(result).not.toHaveProperty("metadata");
    });

    it("ErrorHandler.toResult redacts recursively", () => {
      const result = new ErrorHandler().toResult(dbError);
      expect(result.metadata?.sql).toBe("SELECT * FROM users WHERE ssn='123'");
      expect(
        (result.metadata?.nested as Record<string, unknown>).Authorization,
      ).toBe("[REDACTED]");
    });
  });

  describe("ERR-A-02: native errors are internal, not client errors", () => {
    it("TypeError maps to 500 / not exposed / non-operational", () => {
      const mapped = mapError(
        new TypeError("Cannot read properties of undefined (reading 'id')"),
      );
      expect(mapped.statusCode).toBe(500);
      expect(mapped.expose).toBe(false);
      expect(mapped.isOperational).toBe(false);
      expect(mapped.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(serializePublicError(mapped).message).toBe(
        "An unexpected error occurred.",
      );
    });

    it("RangeError maps the same way and keeps the cause", () => {
      const err = new RangeError("bad");
      const mapped = mapNativeError(err);
      expect(mapped?.statusCode).toBe(500);
      expect(mapped?.cause).toBe(err);
    });
  });

  describe("ERR-A-03: withMetadata works for positional constructors", () => {
    it("AdapterTimeoutError keeps its message and fields", () => {
      const original = new AdapterTimeoutError("pg", "query", 5000);
      const copy = original.withMetadata({ requestId: "r1" });
      expect(copy.message).toBe(original.message);
      expect(copy).toBeInstanceOf(AdapterTimeoutError);
      expect(copy.metadata.requestId).toBe("r1");
      expect(copy.toJSON()).toMatchObject({ message: original.message });
    });

    it("RequestBodyTooLargeError keeps maxSize/actualSize", () => {
      const copy = new RequestBodyTooLargeError(10, 20).withMetadata({ a: 1 });
      expect(copy.maxSize).toBe(10);
      expect(copy.actualSize).toBe(20);
      expect(copy.metadata.a).toBe(1);
    });

    it("DuplicateRegistrationError keeps its message", () => {
      const copy = new DuplicateRegistrationError("logger").withMetadata({ a: 1 });
      expect(copy.message).toBe('Token "logger" is already registered.');
      expect(copy.metadata.a).toBe(1);
    });
  });

  describe("ERR-A-04: HTTP client errors keep causes that carry a code", () => {
    const request = new Request("https://example.com/");

    it("system error is preserved as cause and code is not overwritten", () => {
      const cause = Object.assign(new Error("connect ECONNREFUSED"), {
        code: "ECONNREFUSED",
        errno: -111,
        syscall: "connect",
      });
      const err = new HttpClientNetworkError("net fail", request, cause);
      expect(err.cause).toBe(cause);
      expect(err.code).toBe(ErrorCode.HTTP_CLIENT_NETWORK);
      expect(err.isNetworkError).toBe(true);
      expect(err.metadata.systemCode).toBe("ECONNREFUSED");
      expect(err.metadata.syscall).toBe("connect");
      expect(err.request).toBe(request);
    });

    it("DOMException abort reason is preserved as cause", () => {
      const reason = new DOMException("aborted", "AbortError");
      const err = new HttpClientAbortError(request, reason);
      expect(err.cause).toBe(reason);
      expect(err.isAbortError).toBe(true);
      expect(err.code).toBe(ErrorCode.HTTP_CLIENT_ABORTED);
    });

    it("legacy single-options form still works", () => {
      const err = new HttpClientAbortError({ url: "https://a.b/c?token=1" });
      expect(err.isAbortError).toBe(true);
      expect(err.url).toBe("https://a.b/c");
    });
  });

  describe("ERR-A-05: category/severity helpers return enum members", () => {
    it("returns real enum values for plain errors", () => {
      expect(getErrorCategory(new Error("x"))).toBe(ErrorCategory.UNKNOWN);
      expect(isErrorCategory(getErrorCategory(new Error("x")))).toBe(true);
      expect(getErrorSeverity(new Error("x"))).toBe(ErrorSeverity.ERROR);
      expect(isErrorSeverity(getErrorSeverity(new Error("x")))).toBe(true);
    });
  });

  describe("ERR-A-06 / ERR-A-27: metadata sanitization and immutability", () => {
    it("redactErrorMetadata removes secrets recursively", () => {
      expect(
        redactErrorMetadata({ password: "secret", name: "John", n: { Token: "t" } }),
      ).toEqual({ password: "[REDACTED]", name: "John", n: { Token: "[REDACTED]" } });
      expect(isSensitiveMetadataKey("X-Api-Key")).toBe(true);
      expect(isSensitiveMetadataKey("name")).toBe(false);
    });

    it("sanitizeErrorMetadata redacts on request", () => {
      expect(sanitizeErrorMetadata({ password: "s", name: "J" })).toEqual({
        password: "s",
        name: "J",
      });
      expect(
        sanitizeErrorMetadata({ password: "s", name: "J" }, { redact: true }),
      ).toEqual({ password: "[REDACTED]", name: "J" });
    });

    it("does not crash on cyclic input", () => {
      const cyclic: Record<string, unknown> = { a: 1 };
      cyclic.self = cyclic;
      expect(sanitizeErrorMetadata(cyclic)).toEqual({ a: 1 });
      expect(createErrorMetadata(cyclic as never)).toEqual({ a: 1, self: "[Circular]" });
      expect(isErrorMetadataValue(cyclic)).toBe(false);
    });

    it("never copies __proto__ / constructor keys", () => {
      const poisoned = JSON.parse('{"__proto__":{"isAdmin":true},"x":1}');
      const sanitized = sanitizeErrorMetadata(poisoned);
      expect((sanitized as Record<string, unknown>).isAdmin).toBeUndefined();
      expect(Object.keys(sanitized)).toEqual(["x"]);
      const merged = mergeErrorMetadata({ a: 1 }, poisoned);
      expect((merged as Record<string, unknown>).isAdmin).toBeUndefined();
      const err = new BaseError("x", { metadata: poisoned });
      expect(err.getMetadata("isAdmin")).toBeUndefined();
    });

    it("rejects non-plain objects as metadata values", () => {
      expect(isErrorMetadataValue(new Map([["k", 1]]))).toBe(false);
      expect(isErrorMetadataValue(new Date())).toBe(false);
      expect(isErrorMetadataValue({ a: [1, "b", null, { c: true }] })).toBe(true);
    });

    it("metadata is a deep-frozen copy", () => {
      const source = { nested: { v: 1 }, list: [1] };
      const created = createErrorMetadata(source);
      expect(Object.isFrozen(created.nested)).toBe(true);
      expect(() => {
        (created.nested as { v: number }).v = 2;
      }).toThrow();
      source.nested.v = 3;
      expect((created.nested as { v: number }).v).toBe(1);
    });
  });

  describe("ERR-A-07: RequestBodyTooLargeError is a 413", () => {
    it("has the right status and exposure", () => {
      const err = new RequestBodyTooLargeError(1, 2);
      expect(err.statusCode).toBe(413);
      expect(err.expose).toBe(true);
      expect(err.isOperational).toBe(true);
    });
  });

  describe("ERR-A-08: internal timeouts are not exposed", () => {
    it("database timeout is internal, request timeout is public", () => {
      const db = databaseTimeoutError(100, "users_table");
      expect(db.expose).toBe(false);
      expect(db.target).toBe("users_table");
      expect(db.message).not.toContain("users_table");
      expect(serializePublicError(db)).not.toHaveProperty("metadata");
      expect(requestTimeoutError(100).expose).toBe(true);
      expect(new TimeoutError("x", { operation: TimeoutOperation.LOCK }).expose).toBe(false);
    });
  });

  describe("ERR-A-09: upstream 4xx are bad gateway locally", () => {
    it("maps 401/404 to 502 and passes 429 through", () => {
      expect(new ExternalServiceError("x", { service: "s", responseStatus: 401 }).statusCode).toBe(502);
      expect(new ExternalServiceError("x", { service: "s", responseStatus: 404 }).statusCode).toBe(502);
      expect(new ExternalServiceError("x", { service: "s", responseStatus: 429 }).statusCode).toBe(429);
      expect(new ExternalServiceError("x", { service: "s", responseStatus: 404, statusCode: 404 }).statusCode).toBe(404);
    });
  });

  describe("ERR-A-10: reporter failures are isolated", () => {
    it("handle still returns a result when the reporter throws", async () => {
      const seen: unknown[] = [];
      const handler = new ErrorHandler({
        reporter: () => {
          throw new Error("sentry down");
        },
        onReporterError: (reporterError) => seen.push(reporterError),
      });
      const result = await handler.handle(new BaseError("orig", { statusCode: 400 }));
      expect(result.message).toBe("orig");
      expect(seen).toHaveLength(1);
    });

    it("handle also survives a rejecting reporter without a hook", async () => {
      const handler = new ErrorHandler({
        reporter: async () => {
          throw new Error("down");
        },
      });
      await expect(handler.handle("boom")).resolves.toMatchObject({ statusCode: 500 });
    });
  });

  describe("ERR-A-11: all normalizers agree", () => {
    it("produce the same code/flags and keep the cause", () => {
      const thrown = { weird: true };
      const results = [
        toBaseError(thrown),
        normalizeToBaseError(thrown),
        normalizeUnknownError(thrown),
        normalizeError(thrown),
        new ErrorHandler().normalize(thrown).error,
      ];
      for (const r of results) {
        expect(r.code).toBe(ErrorCode.INTERNAL_ERROR);
        expect(isErrorCode(r.code)).toBe(true);
        expect(r.isOperational).toBe(false);
        expect(r.expose).toBe(false);
        expect(r.cause).toBe(thrown);
      }
      expect(toBaseError("plain string").message).toBe("plain string");
    });
  });

  describe("ERR-A-12: HTTP classes use ErrorCode members", () => {
    it("codes are valid and distinct from domain codes", () => {
      expect(isErrorCode(new HttpNotFoundError().code)).toBe(true);
      expect(new HttpNotFoundError().code).toBe(ErrorCode.HTTP_NOT_FOUND);
      expect(new InternalServerError().code).toBe(ErrorCode.HTTP_INTERNAL_SERVER_ERROR);
      expect(new HttpClientError("x").code).toBe(ErrorCode.HTTP_CLIENT);
    });
  });

  describe("ERR-A-13 / ERR-A-24: mapErrorType accepts typed constructors and declarative mappings", () => {
    class MyErr extends Error {
      constructor(public readonly n: number) {
        super("m");
      }
    }
    it("compiles with typed constructor parameters and maps", () => {
      const registry = createErrorMapperRegistry();
      registry.register(
        mapErrorType("my", MyErr, (error) => new BaseError(`n=${error.n}`, { statusCode: 422 })),
      );
      expect(mapError(new MyErr(3), registry).message).toBe("n=3");
    });
    it("accepts an ErrorMapping object", () => {
      const rule = createErrorMappingRule("m", (e) => e instanceof MyErr, {
        code: ErrorCode.INVALID_INPUT,
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.WARNING,
        statusCode: 400,
        expose: true,
        isOperational: true,
        message: "mapped",
      });
      const registry = createErrorMapperRegistry();
      registry.register(rule);
      const mapped = mapError(new MyErr(1), registry);
      expect(mapped.statusCode).toBe(400);
      expect(mapped.message).toBe("mapped");
      expect(mapped.cause).toBeInstanceOf(MyErr);
    });
  });

  describe("ERR-A-14: serialization is cycle-safe and recursive", () => {
    it("cyclic cause chains do not overflow", () => {
      const a = new BaseError("a");
      const b = new BaseError("b", { cause: a });
      (a as { cause: unknown }).cause = b;
      expect(() => JSON.stringify(b)).not.toThrow();
      expect(JSON.stringify(b)).toContain("[Circular]");
    });

    it("includes nested native cause.cause", () => {
      const root = new Error("root");
      const mid = new Error("mid", { cause: root });
      const json = new BaseError("top", { cause: mid }).toJSON();
      expect((json.cause as { cause: { message: string } }).cause.message).toBe("root");
    });

    it("ErrorSerializer applies includeStack/redaction to causes", () => {
      const cause = new BaseError("c", {
        metadata: { password: "p", headers: { authorization: "Bearer x" } },
      });
      const err = new BaseError("top", { cause });
      const out = serializeError(err, { includeStack: false, includeCause: true });
      expect(out.stack).toBeUndefined();
      const nested = out.cause as { stack?: string; metadata: Record<string, unknown> };
      expect(nested.stack).toBeUndefined();
      expect(nested.metadata.password).toBe("[REDACTED]");
      expect((nested.metadata.headers as Record<string, unknown>).authorization).toBe("[REDACTED]");
    });
  });

  describe("ERR-A-15 / ERR-A-16: server-side misconfiguration is internal", () => {
    it("container and adapter registry errors are 500 and hidden", () => {
      for (const err of [
        new RegistrationNotFoundError("DatabaseClient"),
        new DuplicateRegistrationError("logger"),
        new AdapterNotFoundError("redis"),
        new AdapterAlreadyRegisteredError("redis"),
      ]) {
        expect(err.statusCode).toBe(500);
        expect(err.expose).toBe(false);
        expect(err.isOperational).toBe(false);
      }
    });

    it("route pattern errors share one hierarchy and are internal", () => {
      const dup = new DuplicateRouteParameterError("/a/:id/:id", "id");
      const invalid = new InvalidRoutePatternError("/x", "bad");
      expect(dup.statusCode).toBe(500);
      expect(dup.expose).toBe(false);
      expect(dup.isOperational).toBe(false);
      expect(isRoutePatternError(invalid)).toBe(true);
      expect(isHttpRouterError(new RoutePatternError("x"))).toBe(true);
      expect(invalid.pattern).toBe("/x");
    });
  });

  describe("ERR-A-17: guards recognise branded foreign instances", () => {
    it("isBaseError accepts a structurally identical branded error", () => {
      const foreign = Object.assign(new Error("x"), {
        code: "ERR_X",
        category: "unknown",
        severity: "error",
        statusCode: 500,
        expose: false,
        isOperational: true,
        metadata: {},
        toJSON: () => ({}),
      });
      Object.defineProperty(foreign, BASE_ERROR_BRAND, { value: true });
      expect(foreign instanceof BaseError).toBe(false);
      expect(isBaseError(foreign)).toBe(true);
      expect(isBaseError(new Error("x"))).toBe(false);
      expect(getErrorCategory(foreign)).toBe("unknown");
    });
    it("the brand is not enumerable", () => {
      expect(Object.keys(new BaseError("x"))).not.toContain(BASE_ERROR_BRAND);
      expect(JSON.stringify(new BaseError("x"))).not.toContain("BaseError.brand");
    });
  });

  describe("ERR-A-18: ErrorHandler.serialize never includes a stack", () => {
    it("omits stack even with includeStack enabled", () => {
      const handler = new ErrorHandler({ includeStack: true });
      const out = handler.serialize(new BaseError("x"));
      expect(out).not.toHaveProperty("stack");
      expect(handler.toLogObject(new BaseError("x"))).toHaveProperty("stack");
    });
  });

  describe("ERR-A-20 / ERR-A-21: codes", () => {
    it("MESSAGE_BUS_DISPOSED exists and aliases the old member", () => {
      expect(ErrorCode.MESSAGE_BUS_DISPOSED).toBe("ERR_MESSAGE_BUS_DISPOSED");
      expect(ErrorCode.MESSAGE_BUSDisposed).toBe(ErrorCode.MESSAGE_BUS_DISPOSED);
    });
    it("storage/database/cache/runtime use specific codes", () => {
      expect(storageNotFoundError("f").code).toBe(ErrorCode.STORAGE_NOT_FOUND);
      expect(databaseMigrationError().code).toBe(ErrorCode.DATABASE_MIGRATION);
      expect(new CacheError().code).toBe(ErrorCode.CACHE);
      expect(new RuntimeError("x").code).toBe(ErrorCode.RUNTIME);
    });
  });

  describe("ERR-A-22 / ERR-A-23: factories", () => {
    it("timeout factories accept an options object in any position order", () => {
      expect(serviceTimeoutError({ target: "stripe", timeoutMs: 5 }).timeoutMs).toBe(5);
      expect(serviceTimeoutError("stripe", 5).target).toBe("stripe");
      expect(lockTimeoutError({ target: "l" }).target).toBe("l");
      expect(databaseTimeoutError({ timeoutMs: 7 }).timeoutMs).toBe(7);
    });
    it("externalServiceUnavailableError creates an ExternalServiceError", () => {
      expect(isExternalServiceError(externalServiceUnavailableError("s"))).toBe(true);
      expect(externalServiceUnavailable("s")).toBeInstanceOf(ExternalServiceError);
      expect(isNetworkError(networkServiceUnavailableError("s"))).toBe(true);
    });
  });

  describe("ERR-A-25 / ERR-A-26: HTTP client details", () => {
    it("MethodNotAllowedError serializes its methods", () => {
      const err = new MethodNotAllowedError(["GET", "POST"]);
      expect(err.metadata.allowedMethods).toEqual(["GET", "POST"]);
      expect(err.toJSON()).toMatchObject({ methods: ["GET", "POST"] });
    });
    it("HttpClientError maps upstream status and strips credentials", () => {
      const err = new HttpClientError("x", {
        status: 404,
        url: "https://user:pw@api.example.com/v1?token=abc#frag",
      });
      expect(err.statusCode).toBe(502);
      expect(err.category).toBe(ErrorCategory.NETWORK);
      expect(err.url).toBe("https://api.example.com/v1");
      expect(err.metadata.upstreamStatus).toBe(404);
      expect(new HttpClientError("x", { status: 429 }).statusCode).toBe(429);
    });
  });

  describe("ERR-A-28: crypto signature default message", () => {
    it("depends on the operation", () => {
      expect(cryptoSignatureError(undefined, CryptoOperation.SIGN).message).toBe(
        "Cryptographic signing failed.",
      );
      expect(cryptoSignatureError().message).toBe(
        "Cryptographic signature verification failed.",
      );
    });
  });
});

describe("audit round 6 — coverage additions (ERR-A-32)", () => {
  it("extraction utils walk cause chains", async () => {
    const { getRootCause, getRootBaseError, getErrorDiagnostics, pickErrorMetadata, omitErrorMetadata } =
      await import("../src/index.js");
    const root = new Error("root");
    const base = new BaseError("base", { cause: root });
    const top = new Error("top", { cause: base });
    expect(getRootCause(top)).toBe(root);
    expect(getRootBaseError(top)).toBe(base);
    expect(getErrorDiagnostics(base)).toMatchObject({ code: ErrorCode.UNKNOWN, statusCode: 500 });
    expect(pickErrorMetadata({ a: 1, b: 2 }, ["a", "zzz"])).toEqual({ a: 1 });
    expect(omitErrorMetadata({ a: 1, b: 2 }, "b")).toEqual({ a: 1 });
  });

  it("infrastructure and system classes carry expected defaults", async () => {
    const m = await import("../src/index.js");
    expect(new m.MiddlewareTimeoutError("auth", 10).timeoutMs).toBe(10);
    expect(new m.MiddlewareTimeoutError("auth", 10).withMetadata({ a: 1 }).timeoutMs).toBe(10);
    expect(new m.CircularDependencyError(["a", "b", "a"]).expose).toBe(false);
    expect(m.storageNotFoundError("f").statusCode).toBe(404);
    expect(new m.LoggingError("x").category).toBe(ErrorCategory.LOGGING);
    expect(new m.SystemError("x").statusCode).toBe(500);
    expect(m.cryptoHashError("h", "sha256").algorithm).toBe("sha256");
    expect(new m.HttpClientTimeoutError(5).toJSON()).toMatchObject({ timeout: 5, statusCode: 504 });
    expect(new m.MiddlewareError("x").withMetadata({ k: "v" }).metadata.k).toBe("v");
  });
});
