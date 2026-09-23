/**
 * Post-1.3.0 regressions: CSRF method handling fails closed, and a cookie
 * `Path` must be printable ASCII.
 */
import { ValidationError } from "@zudojs/errors";
import { describe, expect, it } from "vitest";

import {
  MIN_CSRF_SECRET_LENGTH,
  createCsrfProtection,
  generateCsrfCookie,
  requiresCsrfProtection,
  serializeCookie,
} from "../src/index.js";

const SECRET = "s".repeat(MIN_CSRF_SECRET_LENGTH);
const MALFORMED = ["", " ", "POST ", " POST", "FOO", "PO ST", "GET ", "get\n", "CONNECT"];

describe("CSRF verify fails closed on unknown and malformed methods", () => {
  const csrf = createCsrfProtection({ secret: SECRET });

  it("a tokenless request with a malformed method is rejected", () => {
    for (const method of MALFORMED) {
      expect(csrf.verify({ method }), JSON.stringify(method)).toBe(false);
      expect(requiresCsrfProtection(method), JSON.stringify(method)).toBe(true);
    }
    expect(csrf.verify({ method: undefined as never })).toBe(false);
  });

  it("the same method with a valid token passes", () => {
    const { token } = csrf.issue();
    const request = {
      headers: { "x-csrf-token": token },
      cookieHeader: `_csrf=${token}`,
    };
    for (const method of MALFORMED) {
      expect(csrf.verify({ ...request, method }), JSON.stringify(method)).toBe(true);
    }
  });

  it("only the safe methods skip the check, matched after upper-casing", () => {
    for (const method of ["GET", "HEAD", "OPTIONS", "TRACE", "get", "Options"]) {
      expect(csrf.verify({ method }), method).toBe(true);
    }
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "post"]) {
      expect(csrf.verify({ method }), method).toBe(false);
    }
  });

  it("a configured list exempts only standard methods it leaves out", () => {
    const deleteOnly = createCsrfProtection({ secret: SECRET, methods: ["DELETE"] });
    expect(deleteOnly.requiresProtection("POST")).toBe(false);
    expect(deleteOnly.requiresProtection("DELETE")).toBe(true);
    for (const method of ["", " ", "POST ", "FOO", "PROPFIND"]) {
      expect(deleteOnly.requiresProtection(method), JSON.stringify(method)).toBe(true);
      expect(deleteOnly.verify({ method }), JSON.stringify(method)).toBe(false);
    }
    const custom = createCsrfProtection({ secret: SECRET, methods: ["propfind"] });
    expect(custom.requiresProtection("PROPFIND")).toBe(true);
  });
});

describe("cookie Path is printable ASCII", () => {
  it("rejects non-ASCII", () => {
    for (const path of ["/ä", "/café", "/ ", "/\u{1F600}", "/a b"]) {
      expect(
        () => serializeCookie({ name: "sid", value: "v", path }),
        JSON.stringify(path),
      ).toThrow(ValidationError);
    }
  });

  it("accepts space and the rest of printable ASCII except ; and ,", () => {
    for (const path of ["/a b", "/%C3%A4", "/a~b!$&'()*+=:@[]"]) {
      expect(serializeCookie({ name: "sid", value: "v", path })).toContain(
        `Path=${path}`,
      );
    }
  });

  it("the CSRF cookie applies the same rule", () => {
    expect(() => generateCsrfCookie("t", { path: "/ä" })).toThrow(ValidationError);
    expect(() => generateCsrfCookie("t", { path: "/a\r\nX: 1" })).toThrow(
      ValidationError,
    );
    expect(() => createCsrfProtection({ secret: SECRET, path: "/a;b" })).toThrow(
      ValidationError,
    );
    expect(generateCsrfCookie("t", { path: "/app" })).toContain("Path=/app");
  });
});
