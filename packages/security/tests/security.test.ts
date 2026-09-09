/**
 * @zudojs/security — Tests
 *
 * Comprehensive tests for all security modules.
 */

import { describe, it, expect, vi } from "vitest";

import {
  validateHeaderName,
  validateHeaderValue,
  validateHeaders,
  sanitizeHeaderValue,
  isHopByHopHeader,
} from "../src/header/index.js";

import {
  validateUrl,
  normalizePath,
  validateRequestTarget,
  isSafeUrl,
} from "../src/url/index.js";

import {
  DEFAULT_BODY_LIMITS,
  validateContentLength,
  validateBodySize,
  getBodyLimitForContentType,
  validateBodyLimitConfig,
  createBodySizeChecker,
} from "../src/body/index.js";

import {
  parseCookieHeader,
  serializeCookie,
  createSecureCookie,
  validateCookieName,
  validateCookieValue,
  stripSensitiveCookies,
} from "../src/cookie/index.js";

import {
  isOriginAllowed,
  generatePreflightHeaders,
  generateSimpleHeaders,
  isMethodAllowed,
  getDisallowedHeaders,
} from "../src/cors/index.js";

import {
  generateCsrfToken,
  validateCsrfToken,
  requiresCsrfProtection,
  extractCsrfTokenFromHeaders,
  extractCsrfTokenFromCookies,
  generateCsrfCookie,
} from "../src/csrf/index.js";

import {
  createRateLimiter,
  defaultKeyGenerator,
  defaultHandler,
  extractClientIp,
} from "../src/rateLimit/index.js";

import {
  SECURITY_HEADER_NAMES,
  generateSecurityHeaders,
  getMissingSecurityHeaders,
  validateCspDirective,
} from "../src/headers/index.js";

import {
  containsSqlInjection,
  containsXss,
  containsPrototypePollution,
  sanitizeString,
  sanitizeObject,
  isSafeString,
  detectThreats,
  escapeHtml,
  stripHtml,
} from "../src/input/index.js";

/* ─── Header Security ────────────────────────────────────────────────────── */

describe("Header Security", () => {
  describe("validateHeaderName", () => {
    it("accepts valid header names", () => {
      expect(validateHeaderName("Content-Type")).toBeUndefined();
      expect(validateHeaderName("X-Custom-Header")).toBeUndefined();
      expect(validateHeaderName("Accept")).toBeUndefined();
    });

    it("rejects empty header names", () => {
      expect(validateHeaderName("")).toBe("Header name cannot be empty");
    });

    it("rejects header names with invalid characters", () => {
      expect(validateHeaderName("X Bad Header")).toContain(
        "invalid characters",
      );
      expect(validateHeaderName("X;Header")).toContain("invalid characters");
    });
  });

  describe("validateHeaderValue", () => {
    it("accepts valid header values", () => {
      expect(
        validateHeaderValue("Content-Type", "application/json"),
      ).toBeUndefined();
      expect(
        validateHeaderValue("Authorization", "Bearer token123"),
      ).toBeUndefined();
    });

    it("rejects CRLF injection", () => {
      const error = validateHeaderValue("X-Test", "hello\r\nEvil-Header: true");
      expect(error).toContain("CRLF characters");
    });

    it("rejects null bytes", () => {
      const error = validateHeaderValue("X-Test", "hello\x00world");
      expect(error).toContain("null bytes");
    });

    it("rejects oversized values", () => {
      const bigValue = "x".repeat(10000);
      const error = validateHeaderValue("X-Test", bigValue, {
        maxValueSize: 1024,
      });
      expect(error).toContain("exceeds maximum");
    });
  });

  describe("validateHeaders", () => {
    it("validates a clean set of headers", () => {
      const result = validateHeaders({
        "Content-Type": "application/json",
        Accept: "text/html",
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects blocked headers", () => {
      const result = validateHeaders(
        { "X-Forwarded-For": "127.0.0.1" },
        { blockedHeaders: ["x-forwarded-for"] },
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("blocked");
    });

    it("rejects too many headers", () => {
      const headers: Record<string, string> = {};
      for (let i = 0; i < 100; i++) {
        headers[`X-Header-${i}`] = "value";
      }
      const result = validateHeaders(headers, { maxHeaders: 50 });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("Too many headers");
    });
  });

  describe("sanitizeHeaderValue", () => {
    it("removes null bytes", () => {
      expect(sanitizeHeaderValue("hello\x00world")).toBe("helloworld");
    });

    it("removes CRLF", () => {
      expect(sanitizeHeaderValue("hello\r\nworld")).toBe("helloworld");
    });

    it("returns undefined for empty result", () => {
      expect(sanitizeHeaderValue("\x00")).toBeUndefined();
    });
  });

  describe("isHopByHopHeader", () => {
    it("identifies hop-by-hop headers", () => {
      expect(isHopByHopHeader("Connection")).toBe(true);
      expect(isHopByHopHeader("Transfer-Encoding")).toBe(true);
      expect(isHopByHopHeader("Upgrade")).toBe(true);
    });

    it("does not flag regular headers", () => {
      expect(isHopByHopHeader("Content-Type")).toBe(false);
      expect(isHopByHopHeader("Authorization")).toBe(false);
    });
  });
});

/* ─── URL Validation ─────────────────────────────────────────────────────── */

describe("URL Validation", () => {
  describe("validateUrl", () => {
    it("accepts valid HTTP URLs", () => {
      const result = validateUrl("https://example.com/path");
      expect(result.valid).toBe(true);
    });

    it("rejects file:// protocol", () => {
      const result = validateUrl("file:///etc/passwd");
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("not allowed");
    });

    it("rejects overly long URLs", () => {
      const longUrl = "https://example.com/" + "a".repeat(3000);
      const result = validateUrl(longUrl, { maxLength: 2048 });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("exceeds maximum");
    });

    it("detects path traversal", () => {
      const result = validateUrl("https://example.com/../../../etc/passwd");
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("path traversal");
    });

    it("rejects null bytes in URL", () => {
      const result = validateUrl("https://example.com/path%00secret");
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("null bytes");
    });
  });

  describe("normalizePath", () => {
    it("resolves dot segments", () => {
      expect(normalizePath("/users/./profile")).toBe("/users/profile");
    });

    it("resolves parent segments", () => {
      expect(normalizePath("/users/../admin")).toBe("/admin");
    });

    it("handles multiple consecutive slashes", () => {
      expect(normalizePath("/users//profile")).toBe("/users/profile");
    });
  });

  describe("validateRequestTarget", () => {
    it("accepts clean targets", () => {
      const result = validateRequestTarget("/users?page=1&limit=10");
      expect(result.valid).toBe(true);
    });

    it("detects traversal in targets", () => {
      const result = validateRequestTarget("/../../../etc/passwd");
      expect(result.valid).toBe(false);
    });

    it("normalizes paths when requested", () => {
      const result = validateRequestTarget("/users/./profile", {
        normalizePaths: true,
      });
      expect(result.normalized).toBe("/users/profile");
    });
  });

  describe("isSafeUrl", () => {
    it("allows external URLs", () => {
      expect(isSafeUrl("https://example.com")).toBe(true);
    });

    it("blocks file:// URLs", () => {
      expect(isSafeUrl("file:///etc/passwd")).toBe(false);
    });

    it("blocks localhost", () => {
      expect(isSafeUrl("http://localhost:3000")).toBe(false);
    });

    it("blocks internal IPs", () => {
      expect(isSafeUrl("http://192.168.1.1")).toBe(false);
      expect(isSafeUrl("http://10.0.0.1")).toBe(false);
    });
  });
});

/* ─── Body Validation ────────────────────────────────────────────────────── */

describe("Body Validation", () => {
  describe("DEFAULT_BODY_LIMITS", () => {
    it("has correct defaults", () => {
      expect(DEFAULT_BODY_LIMITS.json).toBe(1_048_576);
      expect(DEFAULT_BODY_LIMITS.auth).toBe(262_144);
      expect(DEFAULT_BODY_LIMITS.upload).toBe(104_857_600);
      expect(DEFAULT_BODY_LIMITS.webhook).toBe(2_097_152);
    });
  });

  describe("validateContentLength", () => {
    it("accepts valid content length", () => {
      expect(validateContentLength("1024")).toBeUndefined();
      expect(validateContentLength("0")).toBeUndefined();
    });

    it("accepts undefined (chunked transfer)", () => {
      expect(validateContentLength(undefined)).toBeUndefined();
    });

    it("rejects non-numeric values", () => {
      expect(validateContentLength("abc")).toContain("not a valid number");
    });

    it("rejects negative values", () => {
      // Content-Length is 1*DIGIT: a leading "-" makes it malformed, not
      // merely out of range.
      expect(validateContentLength("-100")).toContain("not a valid number");
    });
  });

  describe("validateBodySize", () => {
    it("accepts sizes within limits", () => {
      expect(validateBodySize(1024, 2048)).toBeUndefined();
    });

    it("rejects oversized bodies", () => {
      expect(validateBodySize(3000, 2048)).toContain("exceeds maximum");
    });

    it("includes content type in error", () => {
      const error = validateBodySize(3000, 2048, "application/json");
      expect(error).toContain("application/json");
    });
  });

  describe("getBodyLimitForContentType", () => {
    it("returns JSON limit for JSON content", () => {
      expect(getBodyLimitForContentType("application/json")).toBe(
        DEFAULT_BODY_LIMITS.json,
      );
    });

    it("returns upload limit for octet-stream", () => {
      expect(getBodyLimitForContentType("application/octet-stream")).toBe(
        DEFAULT_BODY_LIMITS.upload,
      );
    });

    it("returns webhook limit for XML", () => {
      expect(getBodyLimitForContentType("application/xml")).toBe(
        DEFAULT_BODY_LIMITS.webhook,
      );
    });
  });

  describe("validateBodyLimitConfig", () => {
    it("accepts valid config", () => {
      expect(validateBodyLimitConfig({ maxSize: 1024 })).toBeUndefined();
    });

    it("rejects zero or negative", () => {
      expect(validateBodyLimitConfig({ maxSize: 0 })).toContain(
        "must be positive",
      );
      expect(validateBodyLimitConfig({ maxSize: -1 })).toContain(
        "must be positive",
      );
    });

    it("rejects over 1GB", () => {
      expect(validateBodyLimitConfig({ maxSize: 2_000_000_000 })).toContain(
        "exceeds maximum",
      );
    });
  });

  describe("createBodySizeChecker", () => {
    it("returns allowed for sizes within limit", () => {
      const checker = createBodySizeChecker(1024);
      expect(checker(512).allowed).toBe(true);
    });

    it("returns error for sizes over limit", () => {
      const checker = createBodySizeChecker(1024);
      const result = checker(2048);
      expect(result.allowed).toBe(false);
      expect(result.error).toContain("exceeds maximum");
    });
  });
});

/* ─── Cookie Security ────────────────────────────────────────────────────── */

describe("Cookie Security", () => {
  describe("parseCookieHeader", () => {
    it("parses simple cookies", () => {
      const result = parseCookieHeader("name=value; other=test");
      expect(result.cookies).toHaveLength(2);
      expect(result.cookies[0]?.name).toBe("name");
      expect(result.cookies[0]?.value).toBe("value");
    });

    it("cannot carry a semicolon through a value: it is a delimiter", () => {
      // A `;` splits the header before anything else looks at it, so
      // "name=val;ue" is two fragments, not one cookie with a `;` in its
      // value. The previous version of this test asserted only
      // `errors.length > 0` and so passed on the *framing* error for the
      // second fragment while claiming to prove a value rule.
      const result = parseCookieHeader("name=val;ue");
      expect(result.cookies.map((c) => c.name)).toEqual(["name"]);
      expect(result.cookies[0]?.value).toBe("val");
      expect(result.errors).toContain(
        'Cookie 1: missing equals sign in "ue"',
      );
      // The actual value rule lives here, and is what serializeCookie uses.
      expect(validateCookieValue("val;ue")).toBe(
        "Cookie value cannot contain semicolons",
      );
    });

    it("rejects a cookie whose name is not an RFC 6265 token", () => {
      const result = parseCookieHeader("a(b)=1; ok=2");
      expect(result.cookies.map((c) => c.name)).toEqual(["ok"]);
      expect(result.errors.join(" ")).toContain("invalid characters");
    });

    it("rejects a control character in a parsed value", () => {
      const result = parseCookieHeader("sid=a\r\nSet-Cookie: evil=1");
      expect(result.cookies).toHaveLength(0);
      expect(result.errors.join(" ")).toContain("control characters");
    });

    it("rejects empty cookie names", () => {
      const result = parseCookieHeader("=value");
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe("serializeCookie", () => {
    it("serializes basic cookie", () => {
      const result = serializeCookie({ name: "test", value: "123" });
      expect(result).toContain("test=123");
      expect(result).toContain("Secure");
      expect(result).toContain("HttpOnly");
      expect(result).toContain("SameSite=Lax");
    });

    it("includes path and domain", () => {
      const result = serializeCookie({
        name: "test",
        value: "123",
        path: "/api",
        domain: "example.com",
      });
      expect(result).toContain("Path=/api");
      expect(result).toContain("Domain=example.com");
    });
  });

  describe("createSecureCookie", () => {
    it("creates cookie with secure defaults", () => {
      const result = createSecureCookie("session", "abc123");
      expect(result).toContain("session=abc123");
      expect(result).toContain("Secure");
      expect(result).toContain("HttpOnly");
    });
  });

  describe("validateCookieName", () => {
    it("accepts valid names", () => {
      expect(validateCookieName("session")).toBeUndefined();
    });

    it("rejects empty names", () => {
      expect(validateCookieName("")).toContain("cannot be empty");
    });

    it("rejects names with special characters", () => {
      expect(validateCookieName("name with space")).toContain(
        "invalid characters",
      );
      expect(validateCookieName("name;value")).toContain("invalid characters");
    });
  });

  describe("validateCookieValue", () => {
    it("accepts valid values", () => {
      expect(validateCookieValue("simple-value")).toBeUndefined();
    });

    it("rejects control characters", () => {
      expect(validateCookieValue("value\x00here")).toContain(
        "control characters",
      );
    });
  });

  describe("stripSensitiveCookies", () => {
    it("strips session cookies", () => {
      const result = stripSensitiveCookies("session=abc; normal=def");
      expect(result).toBe("normal=def");
    });

    it("strips token cookies", () => {
      const result = stripSensitiveCookies("token=xyz; name=test");
      expect(result).toBe("name=test");
    });
  });
});

/* ─── CORS ───────────────────────────────────────────────────────────────── */

describe("CORS", () => {
  describe("isOriginAllowed", () => {
    it("allows matching string origin", () => {
      expect(
        isOriginAllowed("https://example.com", {
          origin: "https://example.com",
        }),
      ).toBe("https://example.com");
    });

    it("rejects non-matching origin", () => {
      expect(
        isOriginAllowed("https://evil.com", {
          origin: "https://example.com",
        }),
      ).toBeUndefined();
    });

    it("allows wildcard", () => {
      expect(isOriginAllowed("https://anything.com", { origin: "*" })).toBe(
        "*",
      );
    });

    it("allows matching array origin", () => {
      expect(
        isOriginAllowed("https://a.com", {
          origin: ["https://a.com", "https://b.com"],
        }),
      ).toBe("https://a.com");
    });

    it("allows matching regex origin", () => {
      expect(
        isOriginAllowed("https://app.example.com", {
          origin: /^https:\/\/.*\.example\.com$/,
        }),
      ).toBe("https://app.example.com");
    });

    it("allows via function", () => {
      expect(
        isOriginAllowed("https://app.safe.com", {
          origin: (o: string) => o.endsWith(".safe.com"),
        }),
      ).toBe("https://app.safe.com");
    });
  });

  describe("generatePreflightHeaders", () => {
    it("generates headers for allowed origin", () => {
      const headers = generatePreflightHeaders("https://example.com", {
        origin: "https://example.com",
      });
      expect(headers["Access-Control-Allow-Origin"]).toBe(
        "https://example.com",
      );
      expect(headers["Access-Control-Allow-Methods"]).toBeDefined();
      expect(headers["Access-Control-Max-Age"]).toBe("86400");
    });

    it("returns empty headers for disallowed origin", () => {
      const headers = generatePreflightHeaders("https://evil.com", {
        origin: "https://example.com",
      });
      expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
    });
  });

  describe("generateSimpleHeaders", () => {
    it("generates simple CORS headers", () => {
      const headers = generateSimpleHeaders("https://example.com", {
        origin: "https://example.com",
        credentials: true,
      });
      expect(headers["Access-Control-Allow-Origin"]).toBe(
        "https://example.com",
      );
      expect(headers["Access-Control-Allow-Credentials"]).toBe("true");
    });
  });

  describe("isMethodAllowed", () => {
    it("allows standard methods", () => {
      expect(isMethodAllowed("GET", { origin: "*" })).toBe(true);
      expect(isMethodAllowed("POST", { origin: "*" })).toBe(true);
    });

    it("rejects custom methods", () => {
      expect(
        isMethodAllowed("PATCH", { origin: "*", methods: ["GET", "POST"] }),
      ).toBe(false);
    });
  });

  describe("getDisallowedHeaders", () => {
    it("returns empty for all allowed headers", () => {
      const result = getDisallowedHeaders(["Content-Type", "Authorization"], {
        allowedHeaders: ["Content-Type", "Authorization"],
      });
      expect(result).toHaveLength(0);
    });

    it("returns disallowed headers", () => {
      const result = getDisallowedHeaders(["X-Evil-Header", "Content-Type"], {
        allowedHeaders: ["Content-Type"],
      });
      expect(result).toEqual(["X-Evil-Header"]);
    });
  });
});

/* ─── CSRF ───────────────────────────────────────────────────────────────── */

describe("CSRF", () => {
  describe("generateCsrfToken", () => {
    it("generates a valid token", () => {
      const token = generateCsrfToken("csrf-test-secret-0123456789abcdef");
      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
      expect(token.split(":")).toHaveLength(3);
    });
  });

  describe("validateCsrfToken", () => {
    it("validates a correct token", () => {
      const token = generateCsrfToken("csrf-test-secret-0123456789abcdef");
      expect(validateCsrfToken(token, "csrf-test-secret-0123456789abcdef")).toBe(true);
    });

    it("rejects token with wrong secret", () => {
      const token = generateCsrfToken("csrf-test-secret-0123456789abcdef");
      expect(validateCsrfToken(token, "csrf-wrong-secret-0123456789abcdef")).toBe(false);
    });

    it("rejects malformed token", () => {
      expect(validateCsrfToken("not-a-token", "csrf-test-secret-0123456789abcdef")).toBe(false);
    });

    it("rejects expired token", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
      const token = generateCsrfToken("csrf-test-secret-0123456789abcdef", 10);
      vi.setSystemTime(new Date("2025-01-01T00:01:00Z"));
      expect(validateCsrfToken(token, "csrf-test-secret-0123456789abcdef")).toBe(false);
      vi.useRealTimers();
    });
  });

  describe("requiresCsrfProtection", () => {
    it("does not require for GET", () => {
      expect(requiresCsrfProtection("GET")).toBe(false);
    });

    it("requires for POST", () => {
      expect(requiresCsrfProtection("POST")).toBe(true);
    });

    it("requires for PUT", () => {
      expect(requiresCsrfProtection("PUT")).toBe(true);
    });

    it("does not require for OPTIONS", () => {
      expect(requiresCsrfProtection("OPTIONS")).toBe(false);
    });
  });

  describe("extractCsrfTokenFromHeaders", () => {
    it("extracts from x-csrf-token header", () => {
      const token = extractCsrfTokenFromHeaders({
        "x-csrf-token": "my-token",
      });
      expect(token).toBe("my-token");
    });

    it("returns undefined when not present", () => {
      const token = extractCsrfTokenFromHeaders({});
      expect(token).toBeUndefined();
    });
  });

  describe("extractCsrfTokenFromCookies", () => {
    it("extracts CSRF token from cookies", () => {
      const token = extractCsrfTokenFromCookies("_csrf=abc123; session=xyz");
      expect(token).toBe("abc123");
    });

    it("returns undefined when not present", () => {
      const token = extractCsrfTokenFromCookies("session=xyz");
      expect(token).toBeUndefined();
    });
  });

  describe("generateCsrfCookie", () => {
    it("generates secure cookie", () => {
      const cookie = generateCsrfCookie("token123");
      expect(cookie).toContain("_csrf=token123");
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Strict");
    });
  });
});

/* ─── Rate Limiting ──────────────────────────────────────────────────────── */

describe("Rate Limiting", () => {
  describe("defaultKeyGenerator", () => {
    it("uses IP address as key", () => {
      expect(defaultKeyGenerator({ ip: "192.168.1.1" })).toBe("192.168.1.1");
    });

    it("uses unknown when no IP", () => {
      expect(defaultKeyGenerator({})).toBe("unknown");
    });
  });

  describe("extractClientIp", () => {
    it("ignores X-Forwarded-For when no proxy is trusted", () => {
      // The header is client-controlled: trusting it by default hands the
      // caller their own rate-limit bucket.
      const ip = extractClientIp({
        "x-forwarded-for": "1.2.3.4, 5.6.7.8",
      });
      expect(ip).toBe("unknown");
    });

    it("falls back to the socket address when no proxy is trusted", () => {
      const ip = extractClientIp(
        { "x-forwarded-for": "1.2.3.4" },
        { remoteAddress: "9.9.9.9" },
      );
      expect(ip).toBe("9.9.9.9");
    });

    it("takes the hop our own proxy appended", () => {
      // One proxy in front of us: the rightmost entry is the address it saw,
      // everything left of it was supplied by the client.
      const ip = extractClientIp(
        { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
        { trustProxy: 1 },
      );
      expect(ip).toBe("5.6.7.8");
    });

    it("steps left one entry per additional trusted proxy", () => {
      const ip = extractClientIp(
        { "x-forwarded-for": "1.2.3.4, 5.6.7.8, 9.9.9.9" },
        { trustProxy: 2 },
      );
      expect(ip).toBe("5.6.7.8");
    });

    it("does not let a spoofed chain reach past the trusted hops", () => {
      const ip = extractClientIp(
        { "x-forwarded-for": "evil, evil, evil, 5.6.7.8" },
        { trustProxy: 1 },
      );
      expect(ip).toBe("5.6.7.8");
    });

    it("rejects a forwarded value that is not an address", () => {
      const ip = extractClientIp(
        { "x-forwarded-for": "not-an-ip" },
        { trustProxy: 1, remoteAddress: "9.9.9.9" },
      );
      expect(ip).toBe("9.9.9.9");
    });

    it("extracts from X-Real-IP when a proxy is trusted", () => {
      const ip = extractClientIp({ "x-real-ip": "1.2.3.4" }, { trustProxy: 1 });
      expect(ip).toBe("1.2.3.4");
    });

    it("is case-insensitive about header names", () => {
      const ip = extractClientIp(
        { "X-Forwarded-For": "1.2.3.4" },
        { trustProxy: 1 },
      );
      expect(ip).toBe("1.2.3.4");
    });

    it("returns unknown when no headers", () => {
      const ip = extractClientIp({});
      expect(ip).toBe("unknown");
    });
  });

  describe("createRateLimiter", () => {
    it("allows requests within limit", () => {
      const limiter = createRateLimiter({ max: 5, windowMs: 60000 });
      const result = limiter.check({ ip: "1.2.3.4" });
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
      limiter.destroy();
    });

    it("rejects requests over limit", () => {
      const limiter = createRateLimiter({ max: 2, windowMs: 60000 });
      limiter.check({ ip: "1.2.3.4" });
      limiter.check({ ip: "1.2.3.4" });
      const result = limiter.check({ ip: "1.2.3.4" });
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      limiter.destroy();
    });

    it("resets after window", () => {
      vi.useFakeTimers();
      const limiter = createRateLimiter({ max: 2, windowMs: 100 });
      limiter.check({ ip: "1.2.3.4" });
      limiter.check({ ip: "1.2.3.4" });
      vi.advanceTimersByTime(150);
      const result = limiter.check({ ip: "1.2.3.4" });
      expect(result.allowed).toBe(true);
      vi.useRealTimers();
      limiter.destroy();
    });

    it("resets specific key", () => {
      const limiter = createRateLimiter({ max: 1, windowMs: 60000 });
      limiter.check({ ip: "1.2.3.4" });
      limiter.reset("1.2.3.4");
      const result = limiter.check({ ip: "1.2.3.4" });
      expect(result.allowed).toBe(true);
      limiter.destroy();
    });

    it("skips configured requests", () => {
      const limiter = createRateLimiter({
        max: 1,
        windowMs: 60000,
        skip: () => true,
      });
      limiter.check({ ip: "1.2.3.4" });
      limiter.check({ ip: "1.2.3.4" });
      limiter.check({ ip: "1.2.3.4" });
      const result = limiter.check({ ip: "1.2.3.4" });
      expect(result.allowed).toBe(true);
      limiter.destroy();
    });

    it("tracks per-key counts", () => {
      const limiter = createRateLimiter({ max: 2, windowMs: 60000 });
      limiter.check({ ip: "1.1.1.1" });
      limiter.check({ ip: "1.1.1.1" });
      limiter.check({ ip: "2.2.2.2" });

      expect(limiter.getCount("1.1.1.1")).toBe(2);
      expect(limiter.getCount("2.2.2.2")).toBe(1);
      limiter.destroy();
    });

    it("middleware populates response headers when limited", () => {
      const limiter = createRateLimiter({
        max: 1,
        windowMs: 60000,
        handler: defaultHandler,
      });
      limiter.check({ ip: "1.2.3.4" });

      const response = {
        statusCode: 200,
        headers: {} as Record<string, string>,
      };
      const result = limiter.middleware({ ip: "1.2.3.4" }, response);

      expect(result.allowed).toBe(false);
      expect(response.statusCode).toBe(429);
      expect(response.headers["Retry-After"]).toBeDefined();
      limiter.destroy();
    });
  });
});

/* ─── Security Headers ───────────────────────────────────────────────────── */

describe("Security Headers", () => {
  describe("SECURITY_HEADER_NAMES", () => {
    it("has all expected header names", () => {
      expect(SECURITY_HEADER_NAMES.CONTENT_TYPE_OPTIONS).toBe(
        "X-Content-Type-Options",
      );
      expect(SECURITY_HEADER_NAMES.FRAME_OPTIONS).toBe("X-Frame-Options");
      expect(SECURITY_HEADER_NAMES.HSTS).toBe("Strict-Transport-Security");
    });
  });

  describe("generateSecurityHeaders", () => {
    it("generates default security headers", () => {
      const headers = generateSecurityHeaders();
      expect(headers["X-Content-Type-Options"]).toBe("nosniff");
      expect(headers["X-Frame-Options"]).toBe("DENY");
      // The legacy XSS auditor is disabled rather than enabled: it is a
      // no-op in current browsers and introduced its own injection vector in
      // the ones that still honour it.
      expect(headers["X-XSS-Protection"]).toBe("0");
    });

    it("allows custom configuration", () => {
      const headers = generateSecurityHeaders({
        frameOptions: "SAMEORIGIN",
        hsts: "max-age=31536000; includeSubDomains",
      });
      expect(headers["X-Frame-Options"]).toBe("SAMEORIGIN");
      expect(headers["Strict-Transport-Security"]).toBe(
        "max-age=31536000; includeSubDomains",
      );
    });

    it("includes CSP when configured", () => {
      const headers = generateSecurityHeaders({
        contentSecurityPolicy: "default-src 'self'",
      });
      expect(headers["Content-Security-Policy"]).toBe("default-src 'self'");
    });
  });

  describe("getMissingSecurityHeaders", () => {
    it("detects missing headers", () => {
      const missing = getMissingSecurityHeaders({});
      expect(missing.length).toBeGreaterThan(0);
      expect(missing).toContain("X-Content-Type-Options");
    });

    it("returns empty when all headers present", () => {
      const headers: Record<string, string> = {};
      for (const name of Object.values(SECURITY_HEADER_NAMES)) {
        headers[name] = "value";
      }
      const missing = getMissingSecurityHeaders(headers);
      expect(missing).toHaveLength(0);
    });
  });

  describe("validateCspDirective", () => {
    it("warns about unsafe-inline", () => {
      const warning = validateCspDirective(
        "default-src 'self' 'unsafe-inline'",
      );
      expect(warning).toContain("unsafe-inline");
    });

    it("warns about unsafe-eval", () => {
      const warning = validateCspDirective("script-src 'unsafe-eval'");
      expect(warning).toContain("unsafe-eval");
    });

    it("returns undefined for safe directives", () => {
      expect(validateCspDirective("default-src 'self'")).toBeUndefined();
    });

    it("rejects empty directives", () => {
      expect(validateCspDirective("")).toContain("cannot be empty");
    });
  });
});

/* ─── Input Sanitization ─────────────────────────────────────────────────── */

describe("Input Sanitization", () => {
  describe("containsSqlInjection", () => {
    it("detects SQL keywords", () => {
      expect(containsSqlInjection("SELECT * FROM users")).toBe(true);
      expect(containsSqlInjection("'; DROP TABLE users;--")).toBe(true);
    });

    it("allows normal text", () => {
      expect(containsSqlInjection("Hello world")).toBe(false);
      expect(containsSqlInjection("john@example.com")).toBe(false);
    });
  });

  describe("containsXss", () => {
    it("detects script tags", () => {
      expect(containsXss('<script>alert("xss")</script>')).toBe(true);
    });

    it("detects event handlers", () => {
      expect(containsXss('<img onerror="alert(1)">')).toBe(true);
    });

    it("detects javascript: protocol", () => {
      expect(containsXss("javascript:alert(1)")).toBe(true);
    });

    it("allows normal text", () => {
      expect(containsXss("Hello world")).toBe(false);
    });
  });

  describe("containsPrototypePollution", () => {
    it("detects __proto__", () => {
      expect(containsPrototypePollution("__proto__")).toBe(true);
    });

    it("detects constructor", () => {
      expect(containsPrototypePollution("constructor")).toBe(true);
    });

    it("detects prototype", () => {
      expect(containsPrototypePollution("prototype")).toBe(true);
    });

    it("allows normal keys", () => {
      expect(containsPrototypePollution("name")).toBe(false);
      expect(containsPrototypePollution("id")).toBe(false);
    });
  });

  describe("sanitizeString", () => {
    it("removes null bytes", () => {
      expect(sanitizeString("hello\x00world")).toBe("helloworld");
    });

    it("removes control characters", () => {
      expect(sanitizeString("hello\x01\x02world")).toBe("helloworld");
    });

    it("truncates long strings", () => {
      expect(sanitizeString("hello", { maxStringLength: 3 })).toBe("hel");
    });
  });

  describe("sanitizeObject", () => {
    it("removes prototype pollution keys", () => {
      // `__proto__:` in an object literal is the prototype *setter*, so the
      // literal never has a `__proto__` own key and the old version of this
      // test passed whether or not the guard existed. JSON.parse is the only
      // way to build the own property an attacker actually sends.
      const hostile = JSON.parse(
        '{"name":"test","__proto__":{"polluted":true},"constructor":{"c":1},"prototype":{"p":1}}',
      ) as Record<string, unknown>;
      expect(Object.keys(hostile)).toContain("__proto__");

      const result = sanitizeObject(hostile);
      expect(Object.keys(result)).toEqual(["name"]);
      expect(result.name).toBe("test");
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });

    it("sanitizes string values", () => {
      const result = sanitizeObject({ name: "hello\x00world" });
      expect(result.name).toBe("helloworld");
    });

    it("recursively sanitizes nested objects", () => {
      const result = sanitizeObject({
        user: { name: "test\x00hack" },
      });
      expect((result.user as Record<string, string>).name).toBe("testhack");
    });
  });

  describe("isSafeString", () => {
    it("accepts safe strings", () => {
      expect(isSafeString("hello world")).toBe(true);
    });

    it("rejects null bytes", () => {
      expect(isSafeString("hello\x00world")).toBe(false);
    });

    it("rejects control characters", () => {
      expect(isSafeString("hello\x01world")).toBe(false);
    });
  });

  describe("detectThreats", () => {
    it("detects multiple threats", () => {
      const threats = detectThreats("<script>alert('xss')</script>");
      expect(threats).toContain("XSS");
    });

    it("returns empty for safe input", () => {
      const threats = detectThreats("Hello world");
      expect(threats).toHaveLength(0);
    });
  });

  describe("escapeHtml", () => {
    it("escapes HTML characters", () => {
      expect(escapeHtml('<script>alert("xss")</script>')).toBe(
        "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;",
      );
    });

    it("escapes ampersands", () => {
      expect(escapeHtml("a & b")).toBe("a &amp; b");
    });

    it("escapes single quotes", () => {
      expect(escapeHtml("it's")).toBe("it&#39;s");
    });
  });

  describe("stripHtml", () => {
    it("removes HTML tags", () => {
      expect(stripHtml("<p>Hello</p>")).toBe("Hello");
    });

    it("removes nested tags", () => {
      expect(stripHtml("<div><span>Hello</span></div>")).toBe("Hello");
    });
  });
});
