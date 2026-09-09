/**
 * Regression tests for the round-7 audit findings (SEC-01 … SEC-12).
 *
 * Each block reproduces the original defect, so a revert fails here rather
 * than silently restoring the vulnerability.
 */

import { describe, it, expect, afterEach, vi } from "vitest";

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
  parseCookieHeader,
  stripSensitiveCookies,
} from "../src/cookie/index.js";
import { createRateLimiter, extractClientIp } from "../src/rateLimit/index.js";
import {
  validateRequestTarget,
  validateUrl,
  isSafeUrl,
  isPrivateHostname,
  fullyDecodeUri,
} from "../src/url/index.js";
import {
  resolveBodyLimit,
  validateBodyLimitConfig,
} from "../src/body/index.js";
import { validateHeaders } from "../src/header/index.js";
import { validateCspDirective } from "../src/headers/index.js";
import {
  generateCsrfToken,
  validateCsrfToken,
  verifyDoubleSubmit,
  generateCsrfCookie,
  extractCsrfTokenFromHeaders,
  createCsrfProtection,
  MIN_CSRF_SECRET_LENGTH,
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

  it("neutralises an attribute injection by encoding, not by throwing", () => {
    // The old name said "refuses"; the mechanism is acceptance plus
    // percent-encoding, and the old first assertion required a trailing ";"
    // the real output would never have.
    const serialized = serializeCookie({
      name: "sid",
      value: "x; Domain=evil.com",
    });
    const [pair, ...attributes] = serialized.split("; ");
    // The whole hostile value stays inside the name=value pair …
    expect(pair).toBe("sid=x%3B%20Domain%3Devil.com");
    // … and contributes no attribute of its own.
    expect(attributes).not.toContain("Domain=evil.com");
    expect(attributes.some((a) => a.startsWith("Domain"))).toBe(false);
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

  it("round-trips an ordinary value through serialize and parse", () => {
    // "Round-trips" now means what it says: serialize, then parse back.
    const serialized = serializeCookie({ name: "test", value: "123" });
    expect(serialized).toContain("test=123");

    const pair = serialized.split(";")[0] ?? "";
    const parsed = parseCookieHeader(pair);
    expect(parsed.errors).toEqual([]);
    expect(parsed.cookies[0]?.name).toBe("test");
    expect(parsed.cookies[0]?.value).toBe("123");
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

  it("evicts the least-recently-seen key specifically, not an arbitrary one", () => {
    // The size-only assertion above is satisfied by a random-eviction or
    // clear-everything policy too, so the ordering that `lastSeen` exists to
    // provide went unobserved. A fake clock makes the ordering deterministic.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_000);
      const rl = createRateLimiter({ max: 5, windowMs: 600_000, maxKeys: 3 });
      limiters.push(rl);

      rl.check({ ip: "a" });
      vi.setSystemTime(2_000);
      rl.check({ ip: "b" });
      vi.setSystemTime(3_000);
      rl.check({ ip: "c" });

      // Touch "a" again so "b" becomes the least recently seen.
      vi.setSystemTime(4_000);
      rl.check({ ip: "a" });

      vi.setSystemTime(5_000);
      rl.check({ ip: "d" }); // pushes size to 4 → one eviction

      expect(rl.size).toBe(3);
      expect(rl.getCount("b")).toBe(0); // evicted: least recently seen
      expect(rl.getCount("a")).toBeGreaterThan(0);
      expect(rl.getCount("c")).toBeGreaterThan(0);
      expect(rl.getCount("d")).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
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

    const response = {
      statusCode: 200,
      headers: {} as Record<string, string>,
      body: undefined as string | undefined,
    };
    rl.middleware({ ip: "4.4.4.4" }, response);
    rl.middleware({ ip: "4.4.4.4" }, response);

    // The old test asserted only the status code, leaving the three headers
    // and the JSON body the handler exists to write unchecked.
    expect(response.statusCode).toBe(429);
    expect(response.headers["X-RateLimit-Remaining"]).toBe("0");
    expect(response.headers["X-RateLimit-Limit"]).toBe("1");
    expect(response.headers["X-RateLimit-Reset"]).toMatch(/^\d+$/);
    expect(JSON.parse(response.body ?? "{}")).toEqual({
      error: { code: "RATE_LIMIT_EXCEEDED", message: "Too many requests" },
    });
  });

  it("derives Retry-After from the window rather than emitting a fixed 60", () => {
    const rl = createRateLimiter({ max: 1, windowMs: 3_600_000 });
    limiters.push(rl);

    const response = { statusCode: 200, headers: {} as Record<string, string> };
    rl.middleware({ ip: "4.4.4.5" }, response);
    rl.middleware({ ip: "4.4.4.5" }, response);

    const retryAfter = Number(response.headers["Retry-After"]);
    expect(Number.isInteger(retryAfter)).toBe(true);
    // An hour-long window used to report "60".
    expect(retryAfter).toBeGreaterThan(3_500);
    expect(retryAfter).toBeLessThanOrEqual(3_600);
  });

  it("returns the configured message rather than the built-in one", () => {
    const rl = createRateLimiter({
      max: 1,
      windowMs: 60_000,
      message: "Hourly quota exhausted.",
    });
    limiters.push(rl);

    const response = {
      statusCode: 200,
      headers: {} as Record<string, string>,
      body: undefined as string | undefined,
    };
    rl.middleware({ ip: "4.4.4.6" }, response);
    rl.middleware({ ip: "4.4.4.6" }, response);

    expect(JSON.parse(response.body ?? "{}")).toMatchObject({
      error: { message: "Hourly quota exhausted." },
    });
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
    const token = generateCsrfToken("csrf-test-secret-0123456789abcdef", { sessionId: "user-1" });
    expect(validateCsrfToken(token, "csrf-test-secret-0123456789abcdef", { sessionId: "user-1" })).toBe(
      true,
    );
    // A token minted under one session must not validate under another.
    expect(validateCsrfToken(token, "csrf-test-secret-0123456789abcdef", { sessionId: "user-2" })).toBe(
      false,
    );
  });

  it("uses a full-width HMAC, not a truncated hash", () => {
    const signature = generateCsrfToken("csrf-test-secret-0123456789abcdef").split(":")[2] ?? "";
    expect(signature).toHaveLength(64);
  });

  it("enforces the caller's maximum lifetime", () => {
    const longLived = generateCsrfToken("csrf-test-secret-0123456789abcdef", { expiration: 86_400 });
    expect(validateCsrfToken(longLived, "csrf-test-secret-0123456789abcdef", { expiration: 60 })).toBe(
      false,
    );
    expect(validateCsrfToken(longLived, "csrf-test-secret-0123456789abcdef", { expiration: 86_400 })).toBe(
      true,
    );
  });

  it("verifies a double submit only when both sides match and are valid", () => {
    const token = generateCsrfToken("csrf-test-secret-0123456789abcdef");
    expect(verifyDoubleSubmit(token, token, "csrf-test-secret-0123456789abcdef")).toBe(true);
    expect(verifyDoubleSubmit(token, "other", "csrf-test-secret-0123456789abcdef")).toBe(false);
    expect(verifyDoubleSubmit(undefined, token, "csrf-test-secret-0123456789abcdef")).toBe(false);
    expect(verifyDoubleSubmit(token, token, "csrf-wrong-secret-0123456789abcdef")).toBe(false);
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

    const result = sanitizeObject(deep, { maxDepth: 8 });

    // The old body asserted only "does not throw", which passes with the
    // limit ignored entirely. Walk down and check the cut-off actually lands
    // where it was configured to.
    let node: Record<string, unknown> | undefined = result;
    for (let i = 0; i < 8; i++) {
      expect(node).toBeDefined();
      node = node?.next as Record<string, unknown> | undefined;
    }
    expect(node).toBeUndefined();
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


/* ─── SEC9: round-9 findings ─────────────────────────────────────────────── */

const SECRET = "csrf-test-secret-0123456789abcdef";

describe("SEC9-01: a trailing % no longer disables the target guards", () => {
  it("still finds traversal when an escape is malformed", () => {
    // decodeURIComponent throws for the WHOLE string on one bad escape, so
    // this used to decode zero times and report valid: true.
    const result = validateRequestTarget("/a/%2e%2e/etc/passwd%");
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("path traversal");
    expect(result.errors.join(" ")).toContain("invalid percent encoding");
  });

  it("still finds an encoded CRLF when an escape is malformed", () => {
    const result = validateRequestTarget("/a%0d%0aX-Evil:1%");
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("encoded control characters");
  });

  it("reports the malformed escape without losing the rest of the decode", () => {
    const { decoded, malformed, truncated } = fullyDecodeUri("/a/%2e%2e/b%");
    expect(malformed).toBe(true);
    expect(truncated).toBe(false);
    expect(decoded).toBe("/a/../b%");
  });

  it("keeps multi-byte sequences intact while decoding run by run", () => {
    expect(fullyDecodeUri("/caf%C3%A9").decoded).toBe("/café");
    expect(fullyDecodeUri("/caf%C3%A9%").decoded).toBe("/café%");
  });

  it("enforces maxLength on a request target", () => {
    const result = validateRequestTarget("/" + "a".repeat(200), {
      maxLength: 64,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("exceeds maximum 64");
  });

  it("populates normalized from validateUrl when asked", () => {
    const result = validateUrl("https://example.com/a/b/../c", {
      blockTraversal: false,
      normalizePaths: true,
    });
    expect(result.normalized).toBe("https://example.com/a/c");
  });
});

describe("SEC9-02: sanitizeObject cannot reassign a prototype", () => {
  it("keeps unsafe keys as own properties when the guard is opted out of", () => {
    const hostile = JSON.parse(
      '{"__proto__":{"polluted":"yes"},"ok":1}',
    ) as Record<string, unknown>;

    const out = sanitizeObject(hostile, {
      preventPrototypePollution: false,
    }) as Record<string, unknown>;

    // Before: `out.polluted` was "yes" and the prototype had been replaced,
    // with nothing showing in Object.keys.
    expect(Object.keys(out).sort()).toEqual(["__proto__", "ok"]);
    expect(Object.getPrototypeOf(out) as unknown).toBe(Object.prototype);
    expect(out.polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("still drops them by default", () => {
    const hostile = JSON.parse(
      '{"__proto__":{"polluted":"yes"},"constructor":{"c":1},"ok":1}',
    ) as Record<string, unknown>;
    const out = sanitizeObject(hostile) as Record<string, unknown>;
    expect(Object.keys(out)).toEqual(["ok"]);
  });
});

describe("SEC9-03: cookie parsing validates, it does not only measure", () => {
  it("keeps a malformed name out of cookies and names it in errors", () => {
    const result = parseCookieHeader("a(b)=1; good=2");
    expect(result.cookies.map((c) => c.name)).toEqual(["good"]);
    expect(result.errors.join(" ")).toContain("invalid characters");
  });

  it("rejects a CRLF smuggled into a value", () => {
    const result = parseCookieHeader("sid=v\r\nSet-Cookie: evil=1");
    expect(result.cookies).toHaveLength(0);
    expect(result.errors.join(" ")).toContain("control characters");
  });

  it("still accepts the lenient values real servers emit", () => {
    const result = parseCookieHeader('pref=a b,c; quoted="x"');
    expect(result.errors).toEqual([]);
    expect(result.cookies.map((c) => c.value)).toEqual(["a b,c", '"x"']);
  });
});

describe("SEC9-04: CSRF configuration is actually wired", () => {
  it("reads cookieName and headerName from the configuration", () => {
    const csrf = createCsrfProtection({
      secret: SECRET,
      cookieName: "app_csrf",
      headerName: "x-app-csrf",
    });

    const { token, setCookie } = csrf.issue({ sessionId: "s1" });
    expect(setCookie.startsWith("app_csrf=")).toBe(true);

    const ok = csrf.verify(
      {
        method: "POST",
        headers: { "x-app-csrf": token },
        cookieHeader: `app_csrf=${token}`,
      },
      { sessionId: "s1" },
    );
    expect(ok).toBe(true);
  });

  it("rejects a token presented under the default names when others are configured", () => {
    const csrf = createCsrfProtection({
      secret: SECRET,
      cookieName: "app_csrf",
      headerName: "x-app-csrf",
    });
    const { token } = csrf.issue();

    expect(
      csrf.verify({
        method: "POST",
        headers: { "x-csrf-token": token },
        cookieHeader: `_csrf=${token}`,
      }),
    ).toBe(false);
  });

  it("honours the configured session binding and protected methods", () => {
    const csrf = createCsrfProtection({
      secret: SECRET,
      methods: ["DELETE"],
    });
    const { token } = csrf.issue({ sessionId: "s1" });
    const request = {
      method: "POST",
      headers: { "x-csrf-token": token },
      cookieHeader: `_csrf=${token}`,
    };

    // POST is not in the configured method list, so it is not protected.
    expect(csrf.requiresProtection("POST")).toBe(false);
    expect(csrf.verify(request)).toBe(true);

    expect(csrf.requiresProtection("DELETE")).toBe(true);
    expect(
      csrf.verify({ ...request, method: "DELETE" }, { sessionId: "s2" }),
    ).toBe(false);
    expect(
      csrf.verify({ ...request, method: "DELETE" }, { sessionId: "s1" }),
    ).toBe(true);
  });

  it("refuses a secret too short to sign with", () => {
    expect(() => generateCsrfToken("short")).toThrow(/too short/);
    expect(() => generateCsrfToken("short")).toThrow(
      new RegExp(String(MIN_CSRF_SECRET_LENGTH)),
    );
    expect(() => createCsrfProtection({ secret: "short" })).toThrow(
      /too short/,
    );
    expect(() => generateCsrfToken("")).toThrow(/cannot be empty/);
  });
});

describe("SEC9-05: body limits honour contentTypes", () => {
  it("routes a content type to the rule that names it", () => {
    const rules = [
      { maxSize: 1_000 },
      { maxSize: 50, contentTypes: ["application/json"] },
    ];
    // A specific rule wins over the catch-all whatever the order.
    expect(resolveBodyLimit("application/json; charset=utf-8", rules)).toBe(50);
    expect(resolveBodyLimit("text/plain", rules)).toBe(1_000);
    expect(resolveBodyLimit("text/plain", [])).toBe(1_048_576);
  });

  it("reports a contentTypes entry that is not a media type", () => {
    expect(
      validateBodyLimitConfig({ maxSize: 10, contentTypes: ["json"] }),
    ).toContain("not a media type");
    expect(
      validateBodyLimitConfig({
        maxSize: 10,
        contentTypes: ["application/json"],
      }),
    ).toBeUndefined();
  });
});

describe("SEC9-06: header validation", () => {
  it("counts an invalid value towards the total size bound", () => {
    // An oversized value used to be excluded from totalSize, so a header
    // could dodge maxTotalSize by also being malformed.
    const result = validateHeaders(
      { "x-a": "a".repeat(500) },
      { maxValueSize: 10, maxTotalSize: 100 },
    );
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("Total header size");
  });

  it("rejects hop-by-hop headers only when asked", () => {
    const headers = { "transfer-encoding": "chunked" };
    expect(validateHeaders(headers).valid).toBe(true);
    const blocked = validateHeaders(headers, { blockHopByHop: true });
    expect(blocked.valid).toBe(false);
    expect(blocked.errors.join(" ")).toContain("hop-by-hop");
  });

  it("reports every CSP weakness, not just the first", () => {
    const warning = validateCspDirective(
      "default-src 'unsafe-inline' 'unsafe-eval' 'unsafe-hashes'",
    );
    expect(warning).toContain("unsafe-inline");
    expect(warning).toContain("unsafe-eval");
    expect(warning).toContain("unsafe-hashes");
  });
});
