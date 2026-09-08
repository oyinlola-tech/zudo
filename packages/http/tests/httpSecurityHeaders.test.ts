import { describe, expect, it } from "vitest";

import {
  SECURITY_HEADER_NAMES,
  contentSecurityPolicyHeader,
  createDefaultPermissionsPolicy,
  createDefaultSecurityHeaderOptions,
  createDefaultSecurityHeaders,
  createRecommendedSecurityHeaders,
  createSecurityHeaders,
  permissionsPolicyHeader,
  strictTransportSecurityHeader,
} from "../src/httpSecurityHeaders/index.js";

import { parseHSTS } from "../src/httpHsts/index.js";

describe("no empty policies", () => {
  it("contentSecurityPolicy: true emits a real policy, not an empty header", () => {
    const headers = createSecurityHeaders({ contentSecurityPolicy: true });

    const csp = headers["content-security-policy"];

    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("permissionsPolicy: true emits a deny-by-default policy", () => {
    const headers = createSecurityHeaders({ permissionsPolicy: true });

    const pp = headers["permissions-policy"];

    expect(pp).toBeTruthy();
    expect(pp).toContain("camera=()");
    expect(pp).toContain("geolocation=()");
  });

  it("strictTransportSecurity: true uses the recommended policy", () => {
    const headers = createSecurityHeaders({ strictTransportSecurity: true });

    const policy = parseHSTS(headers["strict-transport-security"]);

    expect(policy?.maxAge).toBe(31536000);
    expect(policy?.includeSubDomains).toBe(true);
  });

  it("createRecommendedSecurityHeaders with no options emits a protective set", () => {
    const headers = createRecommendedSecurityHeaders();

    expect(headers["content-security-policy"]).toBeTruthy();
    expect(headers["strict-transport-security"]).toBeTruthy();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBeTruthy();
    expect(headers["permissions-policy"]).toBeTruthy();
  });

  it("createDefaultSecurityHeaders is never empty", () => {
    const headers = createDefaultSecurityHeaders();

    expect(Object.keys(headers).length).toBeGreaterThanOrEqual(8);
    expect(createDefaultSecurityHeaderOptions().contentSecurityPolicy).toBe(
      true,
    );
    expect(
      Object.keys(createDefaultPermissionsPolicy()).length,
    ).toBeGreaterThan(10);
  });
});

describe("consolidated onto the validated implementations", () => {
  it("ADVERSARIAL: CSP directive injection is rejected here too", () => {
    expect(() =>
      contentSecurityPolicyHeader({
        "img-src": ["'self'", "https://a; script-src 'unsafe-inline'"],
      }),
    ).toThrow(TypeError);

    expect(() =>
      contentSecurityPolicyHeader("default-src 'self'\r\nX-Evil: 1"),
    ).toThrow(TypeError);
  });

  it("ADVERSARIAL: HSTS validation from httpHsts now applies", () => {
    // preload without includeSubDomains, and below the preload minimum, are
    // both policies the preload list rejects — the old local formatter emitted
    // them happily.
    expect(() =>
      strictTransportSecurityHeader({ maxAge: 3600, preload: true }),
    ).toThrow(RangeError);

    expect(() =>
      strictTransportSecurityHeader({
        maxAge: 31536000,
        preload: true,
        includeSubDomains: false,
      }),
    ).toThrow(RangeError);

    expect(() => strictTransportSecurityHeader({ maxAge: -1 })).toThrow(
      RangeError,
    );
  });

  it("still formats a valid HSTS policy", () => {
    expect(
      strictTransportSecurityHeader({
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      }),
    ).toBe("max-age=31536000; includeSubDomains; preload");
  });

  it("ADVERSARIAL: Permissions-Policy entries cannot restructure the header", () => {
    expect(() =>
      permissionsPolicyHeader({ camera: ['"https://a", geolocation=*'] }),
    ).toThrow(TypeError);

    expect(() => permissionsPolicyHeader({ "bad name": false })).toThrow(
      TypeError,
    );
  });

  it("formats a valid Permissions-Policy", () => {
    expect(
      permissionsPolicyHeader({
        camera: false,
        microphone: ["self"],
        geolocation: ['"https://maps.example.com"'],
      }),
    ).toBe(
      'camera=(), microphone=(self), geolocation=("https://maps.example.com")',
    );
  });
});

describe("types no longer promise headers the code will not emit", () => {
  it("dropped the deprecated X-XSS-Protection and Expect-CT entries", () => {
    expect(Object.values(SECURITY_HEADER_NAMES)).not.toContain(
      "x-xss-protection",
    );
    expect(Object.values(SECURITY_HEADER_NAMES)).not.toContain("expect-ct");
  });
});
