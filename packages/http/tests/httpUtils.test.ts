import { describe, it, expect } from "vitest";

describe("CORS utilities", () => {
  it("should normalize origins", async () => {
    const { normalizeOrigin } = await import("../src/httpCors/http.cors.js");
    expect(normalizeOrigin(" https://example.com ")).toBe(
      "https://example.com",
    );
    expect(normalizeOrigin("")).toBeUndefined();
    expect(normalizeOrigin(null)).toBeUndefined();
  });

  it("should validate origins", async () => {
    const { isValidOrigin } = await import("../src/httpCors/http.cors.js");
    expect(isValidOrigin("https://example.com")).toBe(true);
    expect(isValidOrigin("http://localhost:3000")).toBe(true);
    expect(isValidOrigin("*")).toBe(true);
    expect(isValidOrigin("ftp://example.com")).toBe(false);
  });

  it("should detect wildcard origin", async () => {
    const { isWildcardOrigin } = await import("../src/httpCors/http.cors.js");
    expect(isWildcardOrigin("*")).toBe(true);
    expect(isWildcardOrigin("https://example.com")).toBe(false);
  });

  it("should normalize methods", async () => {
    const { normalizeMethods } = await import("../src/httpCors/http.cors.js");
    const methods = normalizeMethods("get, post");
    expect(methods).toContain("GET");
    expect(methods).toContain("POST");
  });

  it("should check if method is allowed", async () => {
    const { isMethodAllowed } = await import("../src/httpCors/http.cors.js");
    expect(isMethodAllowed("GET", ["GET", "POST"])).toBe(true);
    expect(isMethodAllowed("DELETE", ["GET", "POST"])).toBe(false);
  });

  it("should normalize header names", async () => {
    const { normalizeHeaderNames } =
      await import("../src/httpCors/http.cors.js");
    const headers = normalizeHeaderNames("Content-Type, Authorization");
    expect(headers).toContain("content-type");
    expect(headers).toContain("authorization");
  });

  it("should check if headers are allowed", async () => {
    const { areHeadersAllowed } = await import("../src/httpCors/http.cors.js");
    expect(
      areHeadersAllowed(["content-type"], ["content-type", "authorization"]),
    ).toBe(true);
    expect(
      areHeadersAllowed(["x-custom"], ["content-type", "authorization"]),
    ).toBe(false);
    expect(areHeadersAllowed(["anything"], ["*"])).toBe(true);
  });

  it("should format vary header", async () => {
    const { formatVaryHeader } = await import("../src/httpCors/http.cors.js");
    const vary = formatVaryHeader(["Origin", "Authorization"]);
    expect(vary).toContain("Origin");
    expect(vary).toContain("Authorization");
  });

  it("should detect preflight requests", async () => {
    const { isPreflightRequest } = await import("../src/httpCors/http.cors.js");
    expect(
      isPreflightRequest({
        origin: "http://example.com",
        method: "OPTIONS",
        requestMethod: "POST",
      }),
    ).toBe(true);
    expect(
      isPreflightRequest({ origin: "http://example.com", method: "GET" }),
    ).toBe(false);
  });
});

describe("CSP utilities", () => {
  it("should parse CSP header", async () => {
    const { parseCSP } =
      await import("../src/httpCsp/parsing/httpCsp.parsing.js");
    const directives = parseCSP("default-src 'self'; script-src 'self'");
    expect(directives["default-src"]).toContain("'self'");
    expect(directives["script-src"]).toContain("'self'");
  });

  it("should format CSP directives", async () => {
    const { formatCSP } =
      await import("../src/httpCsp/formatting/httpCsp.formatting.js");
    const policy = formatCSP({
      "default-src": ["'self'"],
      "script-src": ["'self'"],
    });
    expect(policy).toContain("default-src");
    expect(policy).toContain("'self'");
  });

  it("should generate CSP nonce", async () => {
    const { generateCSPNonce } =
      await import("../src/httpCsp/nonce/httpCsp.nonce.js");
    const nonce = generateCSPNonce();
    expect(typeof nonce).toBe("string");
    expect(nonce.length).toBeGreaterThan(0);
  });

  it("should validate nonce", async () => {
    const { isValidNonce } =
      await import("../src/httpCsp/nonce/httpCsp.nonce.js");
    expect(isValidNonce("abc123")).toBe(true);
    expect(isValidNonce("abc 123")).toBe(false);
  });

  it("should create nonce source", async () => {
    const { createNonceSource } =
      await import("../src/httpCsp/nonce/httpCsp.nonce.js");
    const source = createNonceSource("abc123");
    expect(source).toContain("nonce-abc123");
  });

  it("should create hash source", async () => {
    const { createHashSource } =
      await import("../src/httpCsp/nonce/httpCsp.nonce.js");
    const source = createHashSource("sha256", "abc123");
    expect(source).toContain("sha256-abc123");
  });

  it("should detect self source", async () => {
    const { isSelfSource } =
      await import("../src/httpCsp/sources/httpCsp.sources.js");
    expect(isSelfSource("'self'")).toBe(true);
    expect(isSelfSource("'none'")).toBe(false);
  });

  it("should detect none source", async () => {
    const { isNoneSource } =
      await import("../src/httpCsp/sources/httpCsp.sources.js");
    expect(isNoneSource("'none'")).toBe(true);
    expect(isNoneSource("'self'")).toBe(false);
  });

  it("should detect unsafe-inline source", async () => {
    const { isUnsafeInlineSource } =
      await import("../src/httpCsp/sources/httpCsp.sources.js");
    expect(isUnsafeInlineSource("'unsafe-inline'")).toBe(true);
    expect(isUnsafeInlineSource("'self'")).toBe(false);
  });

  it("should detect unsafe-eval source", async () => {
    const { isUnsafeEvalSource } =
      await import("../src/httpCsp/sources/httpCsp.sources.js");
    expect(isUnsafeEvalSource("'unsafe-eval'")).toBe(true);
    expect(isUnsafeEvalSource("'self'")).toBe(false);
  });

  it("should detect nonce source", async () => {
    const { isNonceSource } =
      await import("../src/httpCsp/sources/httpCsp.sources.js");
    expect(isNonceSource("'nonce-abc123'")).toBe(true);
    expect(isNonceSource("'self'")).toBe(false);
  });

  it("should detect hash source", async () => {
    const { isHashSource } =
      await import("../src/httpCsp/sources/httpCsp.sources.js");
    expect(isHashSource("'sha256-abc123'")).toBe(true);
    expect(isHashSource("'self'")).toBe(false);
  });

  it("should validate CSP", async () => {
    const { validateCSP } =
      await import("../src/httpCsp/validation/httpCsp.validate.js");
    expect(validateCSP({ "default-src": ["'self'"] })).toBe(true);
  });

  it("should validate directive names", async () => {
    const { isValidDirectiveName } =
      await import("../src/httpCsp/validation/httpCsp.validation.js");
    expect(isValidDirectiveName("default-src")).toBe(true);
    expect(isValidDirectiveName("script-src")).toBe(true);
    expect(isValidDirectiveName("INVALID")).toBe(true);
    expect(isValidDirectiveName("invalid name")).toBe(false);
    expect(isValidDirectiveName("123invalid")).toBe(false);
  });
});

describe("HSTS utilities", () => {
  it("should parse HSTS header", async () => {
    const { parseHSTS } = await import("../src/httpHsts/http.hsts.js");
    const policy = parseHSTS("max-age=31536000; includeSubDomains; preload");
    expect(policy).toBeDefined();
    expect(policy?.maxAge).toBe(31536000);
    expect(policy?.includeSubDomains).toBe(true);
    expect(policy?.preload).toBe(true);
  });

  it("should return undefined for empty string", async () => {
    const { parseHSTS } = await import("../src/httpHsts/http.hsts.js");
    expect(parseHSTS("")).toBeUndefined();
    expect(parseHSTS(null)).toBeUndefined();
  });

  it("should format HSTS options", async () => {
    const { formatHSTS } = await import("../src/httpHsts/http.hsts.js");
    const header = formatHSTS({
      maxAge: 31536000,
      includeSubDomains: true,
      preload: false,
    });
    expect(header).toContain("max-age=31536000");
    expect(header).toContain("includeSubDomains");
  });

  it("should validate HSTS", async () => {
    const { validateHSTS } = await import("../src/httpHsts/http.hsts.js");
    expect(validateHSTS("max-age=31536000")).toBe(true);
    expect(validateHSTS("invalid")).toBe(false);
  });

  it("should detect HSTS", async () => {
    const { isHSTS } = await import("../src/httpHsts/http.hsts.js");
    expect(isHSTS("max-age=31536000")).toBe(true);
    expect(isHSTS("invalid")).toBe(false);
  });

  it("should detect preloadable HSTS", async () => {
    const { isHSTSPreloadable } = await import("../src/httpHsts/http.hsts.js");
    expect(isHSTSPreloadable("max-age=31536000; includeSubDomains")).toBe(true);
    expect(isHSTSPreloadable("max-age=100")).toBe(false);
  });

  it("should detect includeSubDomains", async () => {
    const { hasIncludeSubDomains } =
      await import("../src/httpHsts/http.hsts.js");
    expect(hasIncludeSubDomains("max-age=31536000; includeSubDomains")).toBe(
      true,
    );
    expect(hasIncludeSubDomains("max-age=31536000")).toBe(false);
  });

  it("should detect preload", async () => {
    const { hasPreload } = await import("../src/httpHsts/http.hsts.js");
    expect(hasPreload("max-age=31536000; preload")).toBe(true);
    expect(hasPreload("max-age=31536000")).toBe(false);
  });

  it("should get max-age", async () => {
    const { getHSTSMaxAge } = await import("../src/httpHsts/http.hsts.js");
    expect(getHSTSMaxAge("max-age=31536000")).toBe(31536000);
  });

  it("should convert days to seconds", async () => {
    const { hstsDays } = await import("../src/httpHsts/http.hsts.js");
    expect(hstsDays(1)).toBe(86400);
    expect(hstsDays(365)).toBe(31536000);
  });

  it("should convert hours to seconds", async () => {
    const { hstsHours } = await import("../src/httpHsts/http.hsts.js");
    expect(hstsHours(1)).toBe(3600);
  });

  it("should convert minutes to seconds", async () => {
    const { hstsMinutes } = await import("../src/httpHsts/http.hsts.js");
    expect(hstsMinutes(1)).toBe(60);
  });

  it("should create removal header", async () => {
    const { createHSTSRemovalHeader } =
      await import("../src/httpHsts/http.hsts.js");
    expect(createHSTSRemovalHeader()).toBe("max-age=0");
  });
});

describe("Security Headers", () => {
  it("should create individual headers", async () => {
    const { xContentTypeOptionsHeader, xFrameOptionsHeader } =
      await import("../src/httpSecurityHeaders/httpSecurityHeader.individual.js");
    expect(xContentTypeOptionsHeader()).toBe("nosniff");
    expect(xFrameOptionsHeader()).toBe("DENY");
  });

  it("should validate header names", async () => {
    const { validateHeaderName } =
      await import("../src/httpSecurityHeaders/core/httpSecurityHeader.validation.js");
    expect(validateHeaderName("Content-Type").valid).toBe(true);
    expect(validateHeaderName("Content Type").valid).toBe(false);
  });

  it("should validate header values", async () => {
    const { validateHeaderValue } =
      await import("../src/httpSecurityHeaders/core/httpSecurityHeader.validation.js");
    expect(validateHeaderValue("text/html").valid).toBe(true);
    expect(validateHeaderValue("text\r\nhtml").valid).toBe(false);
  });
});

describe("URL Utilities", () => {
  it("should normalize paths", async () => {
    const { normalizePath } = await import("../src/httpUrl/http.url.js");
    expect(normalizePath("//foo///bar")).toBe("/foo/bar");
  });

  it("should join URL paths", async () => {
    const { joinURLPath } = await import("../src/httpUrl/http.url.js");
    expect(joinURLPath("/api", "/users")).toBe("/api/users");
  });

  it("should ensure leading slash", async () => {
    const { ensureLeadingSlash } = await import("../src/httpUrl/http.url.js");
    expect(ensureLeadingSlash("foo")).toBe("/foo");
    expect(ensureLeadingSlash("/foo")).toBe("/foo");
  });

  it("should ensure trailing slash", async () => {
    const { ensureTrailingSlash } = await import("../src/httpUrl/http.url.js");
    expect(ensureTrailingSlash("/foo")).toBe("/foo/");
    expect(ensureTrailingSlash("/foo/")).toBe("/foo/");
  });

  it("should remove trailing slash", async () => {
    const { removeTrailingSlash } = await import("../src/httpUrl/http.url.js");
    expect(removeTrailingSlash("/foo/")).toBe("/foo");
    expect(removeTrailingSlash("/foo")).toBe("/foo");
  });

  it("should remove leading slash", async () => {
    const { removeLeadingSlash } = await import("../src/httpUrl/http.url.js");
    expect(removeLeadingSlash("/foo")).toBe("foo");
    expect(removeLeadingSlash("foo")).toBe("foo");
  });

  it("should detect localhost", async () => {
    const { isLocalhost } = await import("../src/httpUrl/http.url.js");
    expect(isLocalhost("http://localhost:3000")).toBe(true);
    expect(isLocalhost("http://example.com")).toBe(false);
  });

  it("should detect IP literals", async () => {
    const { isIPLiteral } = await import("../src/httpUrl/http.url.js");
    expect(isIPLiteral("http://127.0.0.1")).toBe(true);
    expect(isIPLiteral("http://example.com")).toBe(false);
  });

  it("should detect loopback across IPv6 and non-canonical IPv4 forms", async () => {
    const { isLocalhost } = await import("../src/httpUrl/http.url.js");

    expect(isLocalhost("http://[::1]")).toBe(true);
    expect(isLocalhost("http://[0:0:0:0:0:0:0:1]")).toBe(true);
    expect(isLocalhost("http://[::ffff:127.0.0.1]")).toBe(true);
    expect(isLocalhost("http://0.0.0.0")).toBe(true);
    expect(isLocalhost("http://[2001:db8::1]")).toBe(false);
  });

  it("should detect private host literals in every address form", async () => {
    const { isPrivateHostLiteral } = await import("../src/httpUrl/http.url.js");

    expect(isPrivateHostLiteral("http://10.0.0.1")).toBe(true);
    expect(isPrivateHostLiteral("http://172.16.0.1")).toBe(true);
    expect(isPrivateHostLiteral("http://192.168.1.1")).toBe(true);
    expect(isPrivateHostLiteral("http://169.254.169.254")).toBe(true);
    expect(isPrivateHostLiteral("http://[fc00::1]")).toBe(true);
    expect(isPrivateHostLiteral("http://[fe80::1]")).toBe(true);
    expect(isPrivateHostLiteral("http://[::ffff:169.254.169.254]")).toBe(true);
    expect(isPrivateHostLiteral("http://[2001:db8::1]")).toBe(false);
    expect(isPrivateHostLiteral("http://93.184.216.34")).toBe(false);
  });

  it("should detect loopback in the non-canonical numeric IPv4 forms", async () => {
    const { isLocalhost, isIPLiteral } =
      await import("../src/httpUrl/http.url.js");

    expect(isLocalhost("http://2130706433")).toBe(true);
    expect(isLocalhost("http://0177.0.0.1")).toBe(true);
    expect(isLocalhost("http://0x7f.0.0.1")).toBe(true);
    expect(isLocalhost("http://127.1")).toBe(true);
    expect(isIPLiteral("http://example.com.")).toBe(false);
  });
});

describe("Request Utilities", () => {
  it("should normalize HTTP method", async () => {
    const { normalizeHTTPMethod } =
      await import("../src/httpRequest/http.request.js");
    expect(normalizeHTTPMethod("get")).toBe("GET");
    expect(normalizeHTTPMethod("post")).toBe("POST");
    expect(normalizeHTTPMethod(undefined)).toBe("GET");
  });

  it("should parse accept header", async () => {
    const { parseAcceptHeader } =
      await import("../src/httpRequest/http.request.js");
    const types = parseAcceptHeader("text/html, application/json");
    expect(types).toContain("text/html");
    expect(types).toContain("application/json");
  });

  it("should match media types", async () => {
    const { mediaTypeMatches } =
      await import("../src/httpRequest/http.request.js");
    expect(mediaTypeMatches("text/html", "text/html")).toBe(true);
    expect(mediaTypeMatches("text/html", "application/json")).toBe(false);
    expect(mediaTypeMatches("*/*", "text/html")).toBe(true);
    expect(mediaTypeMatches("text/*", "text/html")).toBe(true);
  });
});

describe("HTTPHeaders", () => {
  it("should create headers from object", async () => {
    const { createHeaders } =
      await import("../src/httpHeaders/http.headers.js");
    const headers = createHeaders({ "content-type": "text/html" });
    expect(headers.get("content-type")).toBe("text/html");
  });

  it("should normalize header names", async () => {
    const { normalizeHeaderName } =
      await import("../src/httpHeaders/http.headers.js");
    expect(normalizeHeaderName("Content-Type")).toBe("content-type");
    expect(normalizeHeaderName("CONTENT-TYPE")).toBe("content-type");
  });

  it("should set and get headers", async () => {
    const { HTTPHeaders } = await import("../src/httpHeaders/http.headers.js");
    const headers = new HTTPHeaders();
    headers.set("Content-Type", "text/html");
    expect(headers.get("content-type")).toBe("text/html");
  });

  it("should delete headers", async () => {
    const { HTTPHeaders } = await import("../src/httpHeaders/http.headers.js");
    const headers = new HTTPHeaders();
    headers.set("Content-Type", "text/html");
    headers.delete("content-type");
    expect(headers.has("content-type")).toBe(false);
  });

  it("should clone headers", async () => {
    const { createHeaders } =
      await import("../src/httpHeaders/http.headers.js");
    const headers = createHeaders({ "content-type": "text/html" });
    const cloned = headers.clone();
    expect(cloned.get("content-type")).toBe("text/html");
  });

  it("should convert to object", async () => {
    const { createHeaders } =
      await import("../src/httpHeaders/http.headers.js");
    const headers = createHeaders({ "content-type": "text/html" });
    const obj = headers.toObject();
    expect(obj["content-type"]).toBe("text/html");
  });
});
