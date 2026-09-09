/**
 * Executes every code example in README.md and in the package doc comment.
 *
 * A README example that does not run is a defect in a library people
 * integrate against, so these are asserted rather than eyeballed.
 */
import { describe, it, expect } from "vitest";
import {
  createRateLimiter,
  extractClientIp,
  retryAfterSeconds,
  generateSimpleHeaders,
  generateSecurityHeaders,
  generatePreflightHeaders,
  createCsrfProtection,
  generateCsrfToken,
  generateCsrfCookie,
  verifyDoubleSubmit,
  extractCsrfTokenFromCookies,
  extractCsrfTokenFromHeaders,
  requiresCsrfProtection,
  isSafeUrl,
  isPrivateHostname,
  validateRequestTarget,
  validateHeaders,
  createSecureCookie,
  parseCookieHeader,
  sanitizeObject,
  detectThreats,
  escapeHtml,
} from "../src/index.js";

describe("README: quick start", () => {
  it("runs end to end", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 100 });
    try {
      const ip = extractClientIp(
        { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
        { trustProxy: 1, remoteAddress: "9.9.9.9" },
      );
      expect(ip).toBe("5.6.7.8");

      const limit = limiter.check({ ip });
      expect(limit.allowed).toBe(true);
      expect(limit.resetAt).toBeInstanceOf(Date);
      expect(Number.isInteger(retryAfterSeconds(limit))).toBe(true);

      const headers = {
        ...generateSecurityHeaders(),
        ...generateSimpleHeaders("https://example.com", {
          origin: ["https://example.com"],
          credentials: true,
        }),
      };
      expect(headers["Vary"]).toBe("Origin");
    } finally {
      limiter.destroy();
    }
  });

  it("runs the package doc-comment example against an origin-form target", () => {
    const request = { headers: { host: "example.com" }, url: "/users?page=1" };
    expect(validateHeaders(request.headers).valid).toBe(true);
    // `validateUrl(request.url)` used to be shown here; it reports every
    // origin-form target as malformed.
    expect(validateRequestTarget(request.url).valid).toBe(true);
  });
});

describe("README: rate limiting", () => {
  it("runs the documented surface", () => {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 100,
      maxKeys: 100_000,
    });
    try {
      const ip = "203.0.113.7";
      expect(limiter.check({ ip }).allowed).toBe(true);
      expect(limiter.getCount(ip)).toBe(1);
      limiter.reset(ip);
      expect(limiter.getCount(ip)).toBe(0);
    } finally {
      limiter.destroy();
    }
  });

  it("runs the middleware example, message and all", () => {
    const limiter = createRateLimiter({
      windowMs: 3_600_000,
      max: 10,
      message: "Hourly quota exhausted.",
    });
    try {
      const response = {
        statusCode: 200,
        headers: {} as Record<string, string>,
        body: undefined as string | undefined,
      };
      for (let i = 0; i < 11; i++) {
        limiter.middleware({ ip: "203.0.113.8" }, response);
      }
      expect(response.statusCode).toBe(429);
      expect(Number(response.headers["Retry-After"])).toBeGreaterThan(3_500);
      expect(response.headers["X-RateLimit-Limit"]).toBe("10");
      expect(response.headers["X-RateLimit-Remaining"]).toBe("0");
      expect(response.headers["X-RateLimit-Reset"]).toMatch(/^\d+$/);
      expect(JSON.parse(response.body ?? "{}")).toMatchObject({
        error: { message: "Hourly quota exhausted." },
      });
    } finally {
      limiter.destroy();
    }
  });
});

describe("README: CORS", () => {
  it("runs the preflight example including the header split", () => {
    const config = { origin: ["https://app.example.com"], credentials: true };
    const request = {
      headers: {
        origin: "https://app.example.com",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type, x-trace",
      } as Record<string, string | undefined>,
    };

    const requested = (request.headers["access-control-request-headers"] ?? "")
      .split(",")
      .map((h) => h.trim())
      .filter((h) => h.length > 0);
    expect(requested).toEqual(["content-type", "x-trace"]);

    const headers = generatePreflightHeaders(request.headers.origin, config, {
      method: request.headers["access-control-request-method"],
      headers: requested,
    });
    expect(headers["Vary"]).toBe("Origin");
  });

  it("throws on a wildcard origin combined with credentials, as documented", () => {
    expect(() =>
      generateSimpleHeaders("https://x.com", {
        origin: "*",
        credentials: true,
      }),
    ).toThrow();
  });
});

describe("README: CSRF", () => {
  const secret = "csrf-readme-secret-0123456789abcdef";

  it("runs the bound-configuration example", () => {
    const csrf = createCsrfProtection({
      secret,
      cookieName: "app_csrf",
      headerName: "x-app-csrf",
      expiration: 3600,
    });

    const sessionId = "sess-1";
    const { token, setCookie } = csrf.issue({ sessionId });
    expect(setCookie).toContain("app_csrf=");

    const ok = csrf.verify(
      {
        method: "POST",
        headers: { "x-app-csrf": token },
        cookieHeader: `app_csrf=${token}`,
      },
      { sessionId },
    );
    expect(ok).toBe(true);
  });

  it("runs the primitives example", () => {
    const sessionId = "sess-2";
    const token = generateCsrfToken(secret, { sessionId, expiration: 3600 });
    const cookieHeader = generateCsrfCookie(token);
    expect(requiresCsrfProtection("POST")).toBe(true);

    const ok = verifyDoubleSubmit(
      extractCsrfTokenFromCookies(cookieHeader.split(";")[0] ?? ""),
      extractCsrfTokenFromHeaders({ "x-csrf-token": token }),
      secret,
      { sessionId },
    );
    expect(ok).toBe(true);
  });
});

describe("README: URLs, cookies and input", () => {
  it("runs the SSRF examples", () => {
    expect(isSafeUrl("http://169.254.169.254/")).toBe(false);
    expect(isSafeUrl("http://[::ffff:127.0.0.1]/")).toBe(false);
    expect(isSafeUrl("gopher://internal/")).toBe(false);
    expect(isPrivateHostname("10.0.0.1")).toBe(true);
  });

  it("produces the documented Set-Cookie", () => {
    const c = createSecureCookie("sid", "abc", { maxAge: 3600 });
    expect(c).toContain("sid=abc");
    expect(c).toContain("Max-Age=3600");
    expect(c).toContain("Secure");
    expect(c).toContain("HttpOnly");
    expect(c).toContain("SameSite=Lax");
  });

  it("validates on the read path as the README now states", () => {
    expect(parseCookieHeader("a(b)=1").errors.join(" ")).toContain(
      "invalid characters",
    );
    expect(parseCookieHeader("ok=1").errors).toEqual([]);
  });

  it("runs the input sanitization examples", () => {
    expect(sanitizeObject({ a: "hello" }, { maxDepth: 32 })).toEqual({
      a: "hello",
    });
    expect(detectThreats("<script>alert(1)</script>")).toContain("XSS");
    expect(escapeHtml("<b>")).toBe("&lt;b&gt;");
  });
});
