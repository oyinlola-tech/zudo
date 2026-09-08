/**
 * Regression tests for the round-7 audit findings (SEC-01 … SEC-12).
 *
 * Each block reproduces the original defect, so a revert fails here rather
 * than silently restoring the vulnerability.
 */

import { describe, it, expect, afterEach } from "vitest";

import {
  containsXss,
  isSafeString,
  detectThreats,
  sanitizeObject,
} from "../src/input/index.js";
import {
  XSS_PATTERNS,
  SQL_INJECTION_PATTERNS,
} from "../src/types/security.type.js";
import {
  generateCspNonce,
  generateSecurityHeaders,
} from "../src/headers/index.js";
import {
  serializeCookie,
  createSecureCookie,
  validateCookieName,
  stripSensitiveCookies,
} from "../src/cookie/index.js";
import { createRateLimiter, extractClientIp } from "../src/rateLimit/index.js";
import {
  validateRequestTarget,
  validateUrl,
  isSafeUrl,
  isPrivateHostname,
} from "../src/url/index.js";
import {
  generateCsrfToken,
  validateCsrfToken,
  verifyDoubleSubmit,
  generateCsrfCookie,
  extractCsrfTokenFromHeaders,
} from "../src/csrf/index.js";
import {
  isOriginAllowed,
  generatePreflightHeaders,
  generateSimpleHeaders,
} from "../src/cors/index.js";
import { sanitizeHeaderValue } from "../src/header/index.js";
import {
  validateContentLength,
  validateBodyFraming,
  getBodyLimitForContentType,
  DEFAULT_BODY_LIMITS,
} from "../src/body/index.js";

/* ─── SEC-01: stateful global regexes ────────────────────────────────────── */

describe("SEC-01: attack detection is not order-dependent", () => {
  it("no shared pattern carries the g flag", () => {
    for (const pattern of XSS_PATTERNS) {
      expect(pattern.global).toBe(false);
    }
    for (const pattern of SQL_INJECTION_PATTERNS) {
      expect(pattern.global).toBe(false);
    }
  });

  it("detects the same XSS payload on every call", () => {
    for (let i = 0; i < 6; i++) {
      expect(containsXss("javascript:alert(1)")).toBe(true);
      expect(containsXss("<img onerror=alert(1)>")).toBe(true);
      expect(containsXss("<script>alert(1)</script>")).toBe(true);
    }
  });

  it("detects the same null byte on every call", () => {
    for (let i = 0; i < 6; i++) {
      expect(isSafeString("a\x00b")).toBe(false);
      expect(detectThreats("a\x00b")).toContain("NULL_BYTE");
    }
  });

  it("normalises a caller-supplied /g pattern", () => {
    const pattern = /^[a-z]+$/g;
    for (let i = 0; i < 6; i++) {
      expect(isSafeString("abc", pattern)).toBe(true);
    }
  });
});

/* ─── SEC-02: require() in ESM ───────────────────────────────────────────── */

describe("SEC-02: generateCspNonce works under ESM", () => {
  it("returns a base64 nonce", () => {
    const nonce = generateCspNonce();
    expect(typeof nonce).toBe("string");
    expect(Buffer.from(nonce, "base64")).toHaveLength(16);
  });

  it("rejects a nonce too short to be unguessable", () => {
    expect(() => generateCspNonce(4)).toThrow(RangeError);
  });
});

/* ─── SEC-03: cookie injection ───────────────────────────────────────────── */

describe("SEC-03: cookie serialization validates its inputs", () => {
  it("neutralises a CRLF in the value", () => {
    // Encoding happens before validation, so the CRLF is escaped rather than
    // rejected — either way it can never reach the wire as a line break.
    const serialized = createSecureCookie("sid", "a\r\nSet-Cookie: admin=1");
    expect(serialized).not.toMatch(/[\r\n]/);
    expect(serialized).toContain("a%0D%0A");
  });

  it("refuses to let a value inject an attribute", () => {
    const serialized = serializeCookie({
      name: "sid",
      value: "x; Domain=evil.com",
    });
    expect(serialized).not.toContain("; Domain=evil.com;");
    expect(serialized).toContain("Domain%3Devil.com");
  });

  it("refuses a CRLF in an attribute", () => {
    expect(() =>
      serializeCookie({ name: "sid", value: "v", domain: "a\r\nX: 1" }),
    ).toThrow(/injection risk/);
  });

  it("refuses SameSite=None without Secure", () => {
    expect(() =>
      serializeCookie({
        name: "s",
        value: "v",
        sameSite: "none",
        secure: false,
      }),
    ).toThrow(/requires the Secure attribute/);
  });

  it("refuses an invalid cookie name", () => {
    expect(() => serializeCookie({ name: "a b", value: "v" })).toThrow();
    expect(validateCookieName("a(b)")).toContain("invalid characters");
  });

  it("round-trips an ordinary value unchanged", () => {
    expect(serializeCookie({ name: "test", value: "123" })).toContain(
      "test=123",
    );
  });

  it("strips prefixed sensitive cookies, not just exact names", () => {
    expect(stripSensitiveCookies("session_id=a; keep=b")).toBe("keep=b");
    expect(stripSensitiveCookies("auth-token=a; keep=b")).toBe("keep=b");
  });
});

/* ─── SEC-04 / SEC-05: rate limiting ─────────────────────────────────────── */

describe("SEC-04: forwarding headers are not trusted by default", () => {
  it("ignores a spoofed X-Forwarded-For", () => {
    expect(extractClientIp({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" })).toBe(
      "unknown",
    );
  });

  it("uses only the hops our own proxies appended", () => {
    expect(
      extractClientIp(
        { "x-forwarded-for": "1.1.1.1, 2.2.2.2, 3.3.3.3" },
        { trustProxy: 1 },
      ),
    ).toBe("3.3.3.3");
  });
});

describe("SEC-05: rate limiter", () => {
  const limiters: Array<{ destroy: () => void }> = [];
  afterEach(() => {
    while (limiters.length) limiters.pop()?.destroy();
  });

  it("stops accruing once the limit is reached", () => {
    const rl = createRateLimiter({ max: 3, windowMs: 1000 });
    limiters.push(rl);

    for (let i = 0; i < 8; i++) rl.check({ ip: "1.1.1.1" });

    // Denied requests must not grow the bucket, or an attack costs memory
    // proportional to its own volume.
    expect(rl.getCount("1.1.1.1")).toBe(3);
  });

  it("allows exactly max requests", () => {
    const rl = createRateLimiter({ max: 3, windowMs: 60_000 });
    limiters.push(rl);

    const outcomes = [1, 2, 3, 4].map(
      () => rl.check({ ip: "2.2.2.2" }).allowed,
    );
    expect(outcomes).toEqual([true, true, true, false]);
  });

  it("reports remaining correctly and never goes negative", () => {
    const rl = createRateLimiter({ max: 2, windowMs: 60_000 });
    limiters.push(rl);

    expect(rl.check({ ip: "3.3.3.3" }).remaining).toBe(1);
    expect(rl.check({ ip: "3.3.3.3" }).remaining).toBe(0);
    expect(rl.check({ ip: "3.3.3.3" }).remaining).toBe(0);
  });

  it("evicts least-recently-seen keys past the cap", () => {
    const rl = createRateLimiter({ max: 5, windowMs: 60_000, maxKeys: 10 });
    limiters.push(rl);

    for (let i = 0; i < 50; i++) rl.check({ ip: `10.0.0.${i}` });
    expect(rl.size).toBeLessThanOrEqual(10);
  });

  it("rejects a nonsensical configuration", () => {
    expect(() => createRateLimiter({ max: 0, windowMs: 1000 })).toThrow(
      RangeError,
    );
    expect(() => createRateLimiter({ max: 5, windowMs: 0 })).toThrow(
      RangeError,
    );
  });

  it("applies the default handler when none is configured", () => {
    const rl = createRateLimiter({ max: 1, windowMs: 60_000 });
    limiters.push(rl);

    const response = { statusCode: 200, headers: {} as Record<string, string> };
    rl.middleware({ ip: "4.4.4.4" }, response);
    rl.middleware({ ip: "4.4.4.4" }, response);

    expect(response.statusCode).toBe(429);
  });
});

/* ─── SEC-06 / SEC-11: request targets and traversal ─────────────────────── */

describe("SEC-06: CR and LF are rejected in a request target", () => {
  it("rejects a literal CRLF", () => {
    const result = validateRequestTarget("/a\r\nX-Injected: 1");
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("control characters");
  });

  it("rejects an encoded CRLF", () => {
    expect(validateRequestTarget("/a%0d%0aX-Injected:%201").valid).toBe(false);
  });

  it("still permits a tab", () => {
    expect(validateRequestTarget("/a\tb").valid).toBe(true);
  });
});

describe("SEC-11: traversal and percent-encoding", () => {
  it.each([
    "/a/../b",
    "/a/%2e%2e/b",
    "/a/.%2e/b",
    "/a/%2e./b",
    "/a/%252e%252e/b",
    "/a/..%2fb",
    "/a/..\\b",
  ])("detects traversal in %s", (target) => {
    expect(validateRequestTarget(target).valid).toBe(false);
  });

  it("flags a truncated percent escape", () => {
    const result = validateUrl("https://example.com/x%");
    expect(result.errors.join(" ")).toContain("invalid percent encoding");
  });

  it("flags a one-character percent escape", () => {
    expect(validateUrl("https://example.com/x%A").errors.join(" ")).toContain(
      "invalid percent encoding",
    );
  });

  it("leaves an ordinary path alone", () => {
    expect(validateRequestTarget("/users?page=1").valid).toBe(true);
  });
});

/* ─── SEC-07: SSRF ───────────────────────────────────────────────────────── */

describe("SEC-07: isSafeUrl blocks internal destinations", () => {
  it.each([
    "http://169.254.169.254/latest/meta-data/",
    "http://[::ffff:127.0.0.1]/",
    "http://127.0.0.2/",
    "http://127.1.2.3/",
    "http://0.0.0.0/",
    "http://[fd00::1]/",
    "http://[fe80::1]/",
    "http://100.64.0.1/",
    "http://10.1.2.3/",
    "http://192.168.1.1/",
    "http://172.16.0.1/",
    "http://172.31.255.255/",
    "http://localhost/",
    "http://foo.local/",
    "http://metadata.google.internal/",
    "http://2130706433/",
    "http://0177.0.0.1/",
    "gopher://internal/",
    "file:///etc/passwd",
    "http://user:pass@example.com/",
  ])("rejects %s", (url) => {
    expect(isSafeUrl(url)).toBe(false);
  });

  it.each([
    "https://example.com/",
    "http://172.32.0.1/",
    "http://8.8.8.8/",
    "http://93.184.216.34/",
  ])("accepts %s", (url) => {
    expect(isSafeUrl(url)).toBe(true);
  });

  it("exposes the hostname check on its own for post-resolution use", () => {
    expect(isPrivateHostname("127.0.0.53")).toBe(true);
    expect(isPrivateHostname("1.1.1.1")).toBe(false);
  });
});

/* ─── SEC-08: CSRF ───────────────────────────────────────────────────────── */

describe("SEC-08: CSRF", () => {
  it("marks the cookie Secure", () => {
    expect(generateCsrfCookie("tok")).toContain("Secure");
  });

  it("can drop HttpOnly for the double-submit pattern", () => {
    expect(generateCsrfCookie("tok", { httpOnly: false })).not.toContain(
      "HttpOnly",
    );
  });

  it("binds a token to a session", () => {
    const token = generateCsrfToken("secret", { sessionId: "user-1" });
    expect(validateCsrfToken(token, "secret", { sessionId: "user-1" })).toBe(
      true,
    );
    // A token minted under one session must not validate under another.
    expect(validateCsrfToken(token, "secret", { sessionId: "user-2" })).toBe(
      false,
    );
  });

  it("uses a full-width HMAC, not a truncated hash", () => {
    const signature = generateCsrfToken("secret").split(":")[2] ?? "";
    expect(signature).toHaveLength(64);
  });

  it("enforces the caller's maximum lifetime", () => {
    const longLived = generateCsrfToken("secret", { expiration: 86_400 });
    expect(validateCsrfToken(longLived, "secret", { expiration: 60 })).toBe(
      false,
    );
    expect(validateCsrfToken(longLived, "secret", { expiration: 86_400 })).toBe(
      true,
    );
  });

  it("verifies a double submit only when both sides match and are valid", () => {
    const token = generateCsrfToken("secret");
    expect(verifyDoubleSubmit(token, token, "secret")).toBe(true);
    expect(verifyDoubleSubmit(token, "other", "secret")).toBe(false);
    expect(verifyDoubleSubmit(undefined, token, "secret")).toBe(false);
    expect(verifyDoubleSubmit(token, token, "wrong-secret")).toBe(false);
  });

  it("rejects an empty secret at generation", () => {
    expect(() => generateCsrfToken("")).toThrow();
  });

  it("finds the header regardless of case", () => {
    expect(extractCsrfTokenFromHeaders({ "X-CSRF-Token": "abc" })).toBe("abc");
  });
});

/* ─── SEC-09: CORS ───────────────────────────────────────────────────────── */

describe("SEC-09: CORS", () => {
  it("refuses a wildcard origin combined with credentials", () => {
    expect(() =>
      generatePreflightHeaders("https://evil.com", {
        origin: "*",
        credentials: true,
      }),
    ).toThrow(/wildcard/);
  });

  it("refuses a wildcard inside an origin array with credentials", () => {
    expect(() =>
      isOriginAllowed("https://a.com", {
        origin: ["https://a.com", "*"],
        credentials: true,
      }),
    ).toThrow(/wildcard/);
  });

  it("sets Vary: Origin whenever the origin is reflected", () => {
    const config = { origin: ["https://a.com", "https://b.com"] };
    expect(generatePreflightHeaders("https://a.com", config).Vary).toBe(
      "Origin",
    );
    expect(generateSimpleHeaders("https://a.com", config).Vary).toBe("Origin");
    // Set even on rejection: the decision still varies by Origin.
    expect(generatePreflightHeaders("https://evil.com", config).Vary).toBe(
      "Origin",
    );
  });

  it("omits Vary for a fixed literal origin", () => {
    const headers = generateSimpleHeaders("https://a.com", {
      origin: "https://a.com",
    });
    expect(headers.Vary).toBeUndefined();
  });

  it("is not order-dependent for a /g regex origin", () => {
    const config = { origin: /^https:\/\/[a-z]+\.example\.com$/g };
    for (let i = 0; i < 6; i++) {
      expect(isOriginAllowed("https://app.example.com", config)).toBe(
        "https://app.example.com",
      );
    }
  });

  it("rejects a preflight asking for a disallowed method", () => {
    const headers = generatePreflightHeaders(
      "https://a.com",
      { origin: "https://a.com", methods: ["GET"] },
      { method: "DELETE" },
    );
    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("rejects a preflight asking for a disallowed header", () => {
    const headers = generatePreflightHeaders(
      "https://a.com",
      { origin: "https://a.com", allowedHeaders: ["Content-Type"] },
      { headers: ["X-Secret"] },
    );
    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });
});

/* ─── SEC-10: sanitizeObject ─────────────────────────────────────────────── */

describe("SEC-10: sanitizeObject", () => {
  it("keeps nested arrays as arrays", () => {
    const result = sanitizeObject({ a: [[1, 2], [3]] } as Record<
      string,
      unknown
    >);
    expect(result.a).toEqual([[1, 2], [3]]);
    expect(Array.isArray((result.a as unknown[])[0])).toBe(true);
  });

  it("survives a cycle instead of overflowing the stack", () => {
    const cyclic: Record<string, unknown> = { n: "x" };
    cyclic.self = cyclic;
    const result = sanitizeObject(cyclic);
    expect(result.n).toBe("x");
    expect(result.self).toBeUndefined();
  });

  it("stops at the configured depth", () => {
    let deep: Record<string, unknown> = { leaf: "end" };
    for (let i = 0; i < 100; i++) deep = { next: deep };
    expect(() => sanitizeObject(deep, { maxDepth: 8 })).not.toThrow();
  });

  it("still strips prototype pollution keys and control characters", () => {
    const result = sanitizeObject(
      JSON.parse('{"__proto__":{"x":1},"name":"a\\u0000b"}') as Record<
        string,
        unknown
      >,
    );
    expect(Object.keys(result)).toEqual(["name"]);
    expect(result.name).toBe("ab");
  });

  it("leaves a Date intact rather than flattening it", () => {
    const when = new Date("2020-01-01T00:00:00Z");
    const result = sanitizeObject({ when } as Record<string, unknown>);
    expect(result.when).toBeInstanceOf(Date);
  });
});

/* ─── SEC-12: assorted ───────────────────────────────────────────────────── */

describe("SEC-12: header, body and default-header fixes", () => {
  it("strips every null byte from a header value", () => {
    expect(sanitizeHeaderValue("a\x00b\x00c")).toBe("abc");
  });

  it("rejects a Content-Length with trailing garbage", () => {
    expect(validateContentLength("100abc")).toContain("not a valid number");
    expect(validateContentLength("1e10")).toContain("not a valid number");
    expect(validateContentLength("+5")).toContain("not a valid number");
    expect(validateContentLength("100")).toBeUndefined();
  });

  it("enforces a maximum Content-Length when given one", () => {
    expect(validateContentLength("2000", 1000)).toContain("exceeds maximum");
  });

  it("rejects ambiguous framing", () => {
    expect(
      validateBodyFraming({
        "content-length": "10",
        "transfer-encoding": "chunked",
      }),
    ).toContain("smuggling");

    expect(validateBodyFraming({ "content-length": ["10", "20"] })).toContain(
      "conflicting",
    );

    expect(
      validateBodyFraming({ "transfer-encoding": "chunked, gzip" }),
    ).toContain("chunked");
  });

  it("gives a form post the JSON limit, not the 100MB upload limit", () => {
    expect(
      getBodyLimitForContentType("application/x-www-form-urlencoded"),
    ).toBe(DEFAULT_BODY_LIMITS.json);
  });

  it("honours an explicit auth purpose", () => {
    expect(
      getBodyLimitForContentType(
        "application/x-www-form-urlencoded",
        undefined,
        "auth",
      ),
    ).toBe(DEFAULT_BODY_LIMITS.auth);
  });

  it("routes on the parsed media type, not substrings", () => {
    expect(getBodyLimitForContentType("application/x-notjson")).toBe(
      DEFAULT_BODY_LIMITS.json,
    );
    expect(getBodyLimitForContentType("application/vnd.api+json")).toBe(
      DEFAULT_BODY_LIMITS.json,
    );
    expect(getBodyLimitForContentType("application/json; charset=utf-8")).toBe(
      DEFAULT_BODY_LIMITS.json,
    );
    expect(getBodyLimitForContentType("multipart/form-data; boundary=x")).toBe(
      DEFAULT_BODY_LIMITS.upload,
    );
  });

  it("ships a CSP and HSTS by default", () => {
    const headers = generateSecurityHeaders();
    expect(headers["Content-Security-Policy"]).toContain("default-src 'self'");
    expect(headers["Strict-Transport-Security"]).toContain("max-age=");
  });

  it("refuses a config value carrying a CRLF", () => {
    expect(() =>
      generateSecurityHeaders({ contentSecurityPolicy: "a\r\nX-Evil: 1" }),
    ).toThrow(/injection risk/);
  });
});
