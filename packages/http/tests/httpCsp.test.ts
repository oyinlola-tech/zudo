import { describe, expect, it } from "vitest";

import {
  CSP_DIRECTIVES,
  browserCSP,
  createCSP,
  createCSPHeaders,
  createNonceSource,
  formatCSP,
  generateCSPNonce,
  hasCSPDirective,
  isValidNonce,
  parseCSP,
  validateCSP,
} from "../src/httpCsp/index.js";

describe("directive value injection", () => {
  it("ADVERSARIAL: a value containing ';' cannot inject a directive", () => {
    expect(() =>
      createCSP({
        scriptSrc: ["'self'", "https://cdn.example.com; script-src *"],
      }),
    ).toThrow(TypeError);

    // The classic case: injecting a directive that has not been emitted yet.
    expect(() =>
      createCSP({
        imgSrc: ["'self'", "https://cdn.example; script-src 'unsafe-inline'"],
        scriptSrc: ["'self'"],
      }),
    ).toThrow(TypeError);
  });

  it("ADVERSARIAL: a value containing a newline or CR is rejected", () => {
    expect(() => createCSP({ scriptSrc: ["'self'", "a\nb"] })).toThrow(
      TypeError,
    );
    expect(() => createCSP({ scriptSrc: ["'self'", "a\rb"] })).toThrow(
      TypeError,
    );
    expect(() =>
      createCSP({ scriptSrc: ["'self'", "a\r\nscript-src *"] }),
    ).toThrow(TypeError);
    expect(() => createCSP({ scriptSrc: ["'self'", "a\u0000b"] })).toThrow(
      TypeError,
    );
  });

  it("ADVERSARIAL: a value containing ',' cannot start a second policy", () => {
    expect(() =>
      createCSP({ defaultSrc: ["'self'", "https://a.example, default-src *"] }),
    ).toThrow(TypeError);
  });

  it("ADVERSARIAL: injection through the raw directives record is rejected too", () => {
    expect(() =>
      createCSP({ directives: { "img-src": "https://a; script-src *" } }),
    ).toThrow(TypeError);
  });

  it("rejects a malformed directive name", () => {
    expect(() => createCSP({ directives: { "img src": "'self'" } })).toThrow(
      TypeError,
    );
    expect(() => formatCSP({ "9bad": ["'self'"] })).toThrow(TypeError);
  });

  it("still builds ordinary policies", () => {
    const result = createCSP({
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://cdn.example.com"],
    });

    expect(result.policy).toBe(
      "default-src 'self'; script-src 'self' https://cdn.example.com",
    );
    expect(validateCSP(result.directives)).toBe(true);
  });
});

describe("nonce generation", () => {
  it("ADVERSARIAL: two responses must not share a nonce", () => {
    const first = generateCSPNonce();
    const second = generateCSPNonce();

    expect(first).not.toBe(second);

    const seen = new Set<string>();

    for (let index = 0; index < 500; index += 1) {
      seen.add(generateCSPNonce());
    }

    expect(seen.size).toBe(500);
  });

  it("produces a policy whose nonce differs per response", () => {
    const responseA = createCSPHeaders({
      scriptSrc: ["'self'", createNonceSource(generateCSPNonce())],
    });

    const responseB = createCSPHeaders({
      scriptSrc: ["'self'", createNonceSource(generateCSPNonce())],
    });

    expect(responseA["Content-Security-Policy"]).not.toBe(
      responseB["Content-Security-Policy"],
    );
  });

  it("uses the platform CSPRNG and enough entropy by default", () => {
    const nonce = generateCSPNonce();

    expect(isValidNonce(nonce)).toBe(true);
    // 16 random bytes, base64url-encoded.
    expect(nonce.length).toBeGreaterThanOrEqual(21);
  });

  it("rejects an invalid nonce rather than emitting it", () => {
    expect(() => createNonceSource("bad nonce'; script-src *")).toThrow(
      TypeError,
    );
    expect(isValidNonce("")).toBe(false);
  });
});

describe("policy helpers", () => {
  it("browserCSP drops 'unsafe-inline' from style-src when a nonce is given", () => {
    const nonce = generateCSPNonce();

    const withNonce = browserCSP(nonce);

    expect(withNonce.directives["style-src"]).toContain(
      createNonceSource(nonce),
    );
    expect(withNonce.directives["style-src"]).not.toContain("'unsafe-inline'");
    expect(withNonce.directives["script-src"]).toContain(
      createNonceSource(nonce),
    );

    // Without a nonce the pragmatic default is unchanged.
    expect(browserCSP(undefined).directives["style-src"]).toContain(
      "'unsafe-inline'",
    );
  });

  it("hasCSPDirective actually reports presence", () => {
    const policy = parseCSP("default-src 'self'; img-src *");

    expect(hasCSPDirective(policy, "img-src")).toBe(true);
    expect(hasCSPDirective(policy, "script-src")).toBe(false);
    expect(hasCSPDirective("default-src 'self'", "frame-ancestors")).toBe(
      false,
    );
  });

  it("CSP_DIRECTIVES has no duplicates and no source expressions", () => {
    expect(new Set(CSP_DIRECTIVES).size).toBe(CSP_DIRECTIVES.length);
    expect(CSP_DIRECTIVES).not.toContain("wasm-unsafe-eval");
  });
});
