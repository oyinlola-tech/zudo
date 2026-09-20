/**
 * Audit round 11 regressions for @zudojs/security.
 */

import { describe, it, expect } from "vitest";
import { ConfigurationError } from "@zudojs/errors";

import {
  containsTraversal,
  createCsrfProtection,
  extractClientIp,
  requiresCsrfProtection,
  sanitizeObject,
  validateRequestTarget,
} from "../src/index.js";

const SECRET = "s".repeat(40);

describe("SEC-01 — a short X-Forwarded-For chain is not trusted", () => {
  it("falls through to remoteAddress when the chain is shorter than trustProxy", () => {
    expect(
      extractClientIp(
        { "x-forwarded-for": "1.2.3.4" },
        { trustProxy: 2, remoteAddress: "9.9.9.9" },
      ),
    ).toBe("9.9.9.9");
  });

  it("falls through to x-real-ip rather than the client-written entry", () => {
    expect(
      extractClientIp(
        { "x-forwarded-for": "1.2.3.4", "x-real-ip": "9.9.9.9" },
        { trustProxy: 3, remoteAddress: "8.8.8.8" },
      ),
    ).toBe("9.9.9.9");
  });

  it("gives an attacker no way to pick their own rate-limit bucket", () => {
    const seen = new Set<string>();
    for (const spoof of ["1.1.1.1", "2.2.2.2", "3.3.3.3"]) {
      seen.add(
        extractClientIp(
          { "x-forwarded-for": spoof },
          { trustProxy: 2, remoteAddress: "9.9.9.9" },
        ),
      );
    }
    expect([...seen]).toEqual(["9.9.9.9"]);
  });

  it("still reads the chain when it is long enough", () => {
    expect(
      extractClientIp(
        { "x-forwarded-for": "1.2.3.4, 5.6.7.8, 10.0.0.1" },
        { trustProxy: 2, remoteAddress: "9.9.9.9" },
      ),
    ).toBe("5.6.7.8");
  });

  it("uses the leftmost entry when the chain is exactly trustProxy long", () => {
    expect(
      extractClientIp(
        { "x-forwarded-for": "5.6.7.8, 10.0.0.1" },
        { trustProxy: 2, remoteAddress: "9.9.9.9" },
      ),
    ).toBe("5.6.7.8");
  });
});

describe("SEC-04 — an empty CSRF methods list is a configuration error", () => {
  it("rejects methods: [] at construction", () => {
    expect(() => createCsrfProtection({ secret: SECRET, methods: [] })).toThrow(
      ConfigurationError,
    );
  });

  it("rejects an empty list in requiresCsrfProtection", () => {
    expect(() =>
      requiresCsrfProtection("POST", { secret: SECRET, methods: [] }),
    ).toThrow(ConfigurationError);
  });

  it("rejects a non-array methods value", () => {
    expect(() =>
      createCsrfProtection({
        secret: SECRET,
        methods: "POST" as unknown as readonly string[],
      }),
    ).toThrow(ConfigurationError);
  });

  it("rejects a blank method name", () => {
    expect(() =>
      createCsrfProtection({ secret: SECRET, methods: ["POST", "  "] }),
    ).toThrow(ConfigurationError);
  });

  it("still accepts an omitted methods list and protects POST", () => {
    const csrf = createCsrfProtection({ secret: SECRET });
    expect(csrf.requiresProtection("POST")).toBe(true);
    expect(csrf.verify({ method: "POST", headers: {} })).toBe(false);
  });
});

describe("SEC-07 — `..;` is a traversal segment", () => {
  it("catches a path parameter hiding the traversal", () => {
    expect(containsTraversal("/a/..;/b")).toBe(true);
    expect(containsTraversal("/a/..;foo/b")).toBe(true);
    expect(containsTraversal("/a/..%3B/b")).toBe(true);
  });

  it("reports it through validateRequestTarget like every other spelling", () => {
    const encoded = validateRequestTarget("/a/..%2fb");
    const parameterised = validateRequestTarget("/a/..;/b");
    expect(encoded.valid).toBe(false);
    expect(parameterised.valid).toBe(false);
    expect(parameterised.errors).toEqual(encoded.errors);
  });

  it("keeps the spellings the decode-to-fixed-point design already caught", () => {
    expect(containsTraversal("/a/%2e%2e/b")).toBe(true);
    expect(containsTraversal("/a/%252e%252e/b")).toBe(true);
    expect(containsTraversal("/a/..%2fb")).toBe(true);
  });

  it("does not turn `....//` or an ordinary path parameter into a traversal", () => {
    expect(containsTraversal("/a/....//b")).toBe(false);
    expect(containsTraversal("/a/b;version=2/c")).toBe(false);
    expect(containsTraversal("/a/.;/b")).toBe(false);
    expect(validateRequestTarget("/a/b;version=2/c").valid).toBe(true);
  });
});

describe("SEC-08 — maxDepth must be an integer of 1 or more", () => {
  it("rejects maxDepth: 0 instead of returning undefined as T", () => {
    expect(() => sanitizeObject({ a: "b" }, { maxDepth: 0 })).toThrow(
      ConfigurationError,
    );
  });

  it("rejects negative, fractional and NaN depths", () => {
    for (const maxDepth of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => sanitizeObject({ a: "b" }, { maxDepth })).toThrow(
        ConfigurationError,
      );
    }
  });

  it("still sanitizes at maxDepth: 1 and returns a real object", () => {
    const result = sanitizeObject(
      { a: "b", nested: { c: "d" } },
      { maxDepth: 1 },
    );
    expect(result.a).toBe("b");
    expect(result.nested).toBeUndefined();
  });
});
