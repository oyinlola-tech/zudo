/**
 * @zudojs/http — Security tests.
 *
 * Tests for request guard, header validation, host validation,
 * body limits, request ID validation, and smuggling protection.
 */

import { describe, it, expect } from "vitest";
import {
  validateHeaders,
  validateHost,
  validateUrl,
  validateQuery,
  validateContentLength,
  validateRequestId,
  validateTransferEncoding,
  guardRequest,
  DEFAULT_SECURITY_CONFIG,
} from "../src/httpSecurity/index.js";

// ─── Header Validation ───────────────────────────────────────

describe("validateHeaders", () => {
  it("allows valid headers", () => {
    const result = validateHeaders({
      "content-type": "application/json",
      authorization: "Bearer token",
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects too many headers", () => {
    const headers: Record<string, string> = {};
    for (let i = 0; i < 150; i++) {
      headers[`x-header-${i}`] = "value";
    }
    const result = validateHeaders(headers);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Too many headers");
  });

  it("rejects oversized header values", () => {
    const result = validateHeaders({
      "x-large": "x".repeat(10_000),
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("value too large");
  });

  it("rejects CRLF injection in headers", () => {
    const result = validateHeaders({
      "x-injected": "hello\r\nEvil-Header: true",
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("CRLF");
  });

  it("can disable CRLF protection", () => {
    const result = validateHeaders(
      { "x-injected": "hello\r\nEvil-Header: true" },
      { enableCrlfProtection: false },
    );
    expect(result.valid).toBe(true);
  });
});

// ─── Host Validation ──────────────────────────────────────────

describe("validateHost", () => {
  it("rejects missing host", () => {
    const result = validateHost(undefined);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Missing Host");
  });

  it("allows any host when allowedHosts is empty", () => {
    const result = validateHost("evil.com");
    expect(result.valid).toBe(true);
  });

  it("allows matching host", () => {
    const result = validateHost("example.com", {
      allowedHosts: ["example.com", "www.example.com"],
    });
    expect(result.valid).toBe(true);
  });

  it("rejects non-matching host", () => {
    const result = validateHost("evil.com", {
      allowedHosts: ["example.com"],
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("not in allowed hosts");
  });

  it("matches host with port", () => {
    const result = validateHost("example.com:3000", {
      allowedHosts: ["example.com"],
    });
    expect(result.valid).toBe(true);
  });
});

// ─── URL Validation ───────────────────────────────────────────

describe("validateUrl", () => {
  it("allows normal URLs", () => {
    const result = validateUrl("/api/users/123");
    expect(result.valid).toBe(true);
  });

  it("rejects overly long URLs", () => {
    const result = validateUrl("/" + "a".repeat(3000));
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("URL too long");
  });
});

// ─── Query Validation ─────────────────────────────────────────

describe("validateQuery", () => {
  it("allows normal queries", () => {
    const result = validateQuery("page=1&limit=10");
    expect(result.valid).toBe(true);
  });

  it("rejects overly long queries", () => {
    const result = validateQuery("q=" + "a".repeat(5000));
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Query string too long");
  });
});

// ─── Content-Length Validation ─────────────────────────────────

describe("validateContentLength", () => {
  it("allows valid content-length", () => {
    const result = validateContentLength("1024");
    expect(result.valid).toBe(true);
  });

  it("allows missing content-length", () => {
    const result = validateContentLength(undefined);
    expect(result.valid).toBe(true);
  });

  it("rejects non-numeric content-length", () => {
    const result = validateContentLength("not-a-number");
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Invalid Content-Length");
  });

  it("rejects negative content-length", () => {
    const result = validateContentLength("-100");
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Invalid Content-Length");
  });

  it("rejects content-length exceeding body limit", () => {
    const result = validateContentLength("999999999");
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("exceeds body limit");
  });

  it("rejects unsafe integer content-length", () => {
    const result = validateContentLength("9007199254740993");
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("not a safe integer");
  });
});

// ─── Request ID Validation ────────────────────────────────────

describe("validateRequestId", () => {
  it("allows valid request IDs", () => {
    const result = validateRequestId("abc-123_def");
    expect(result.valid).toBe(true);
  });

  it("allows missing request ID", () => {
    const result = validateRequestId(undefined);
    expect(result.valid).toBe(true);
  });

  it("rejects overly long request IDs", () => {
    const result = validateRequestId("a".repeat(200));
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("too long");
  });

  it("rejects request IDs with invalid characters", () => {
    const result = validateRequestId("id with spaces");
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("invalid characters");
  });
});

// ─── Transfer Encoding Validation ─────────────────────────────

describe("validateTransferEncoding", () => {
  it("allows chunked transfer encoding", () => {
    const result = validateTransferEncoding("chunked", undefined);
    expect(result.valid).toBe(true);
  });

  it("rejects both Transfer-Encoding and Content-Length", () => {
    const result = validateTransferEncoding("chunked", "100");
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain(
      "both Transfer-Encoding and Content-Length",
    );
  });

  it("rejects non-chunked transfer encoding", () => {
    const result = validateTransferEncoding("gzip", undefined);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Unsupported Transfer-Encoding");
  });

  it("can disable smuggling protection", () => {
    const result = validateTransferEncoding("chunked", "100", {
      enableSmugglingProtection: false,
    });
    expect(result.valid).toBe(true);
  });
});

// ─── Request Guard ────────────────────────────────────────────

describe("guardRequest", () => {
  it("allows valid requests", () => {
    const result = guardRequest({
      method: "GET",
      url: "/api/users",
      headers: { host: "example.com" },
    });
    expect(result.allowed).toBe(true);
  });

  it("rejects requests with too many headers", () => {
    const headers: Record<string, string> = { host: "example.com" };
    for (let i = 0; i < 200; i++) {
      headers[`x-${i}`] = "v";
    }
    const result = guardRequest({
      method: "GET",
      url: "/api/users",
      headers,
    });
    expect(result.allowed).toBe(false);
    expect(result.statusCode).toBe(400);
  });

  it("rejects requests with CRLF in headers", () => {
    const result = guardRequest({
      method: "GET",
      url: "/api/users",
      headers: { host: "example.com", "x-evil": "a\r\nb" },
    });
    expect(result.allowed).toBe(false);
  });

  it("rejects requests with invalid host", () => {
    const result = guardRequest(
      { method: "GET", url: "/api/users", headers: { host: "evil.com" } },
      { allowedHosts: ["example.com"] },
    );
    expect(result.allowed).toBe(false);
  });

  it("rejects requests with oversized URL", () => {
    const result = guardRequest({
      method: "GET",
      url: "/" + "a".repeat(3000),
      headers: { host: "example.com" },
    });
    expect(result.allowed).toBe(false);
  });

  it("rejects requests with Content-Length exceeding body limit", () => {
    const result = guardRequest({
      method: "POST",
      url: "/api/upload",
      headers: { host: "example.com", "content-length": "999999999" },
    });
    expect(result.allowed).toBe(false);
  });

  it("rejects requests with smuggling headers", () => {
    const result = guardRequest({
      method: "POST",
      url: "/api/data",
      headers: {
        host: "example.com",
        "transfer-encoding": "chunked",
        "content-length": "100",
      },
    });
    expect(result.allowed).toBe(false);
  });

  it("rejects requests with invalid request ID", () => {
    const result = guardRequest({
      method: "GET",
      url: "/api/users",
      headers: { host: "example.com", "x-request-id": "a".repeat(200) },
    });
    expect(result.allowed).toBe(false);
  });
});

// ─── Default Config ───────────────────────────────────────────

describe("DEFAULT_SECURITY_CONFIG", () => {
  it("has sensible defaults", () => {
    expect(DEFAULT_SECURITY_CONFIG.maxBodySize).toBe(10 * 1024 * 1024);
    expect(DEFAULT_SECURITY_CONFIG.maxHeaders).toBe(100);
    expect(DEFAULT_SECURITY_CONFIG.maxHeaderValueSize).toBe(8_192);
    expect(DEFAULT_SECURITY_CONFIG.maxUrlLength).toBe(2048);
    expect(DEFAULT_SECURITY_CONFIG.maxQueryLength).toBe(4096);
    expect(DEFAULT_SECURITY_CONFIG.trustProxy).toBe(false);
    expect(DEFAULT_SECURITY_CONFIG.enableCrlfProtection).toBe(true);
    expect(DEFAULT_SECURITY_CONFIG.enableSmugglingProtection).toBe(true);
  });

  it("is frozen", () => {
    expect(Object.isFrozen(DEFAULT_SECURITY_CONFIG)).toBe(true);
  });
});
