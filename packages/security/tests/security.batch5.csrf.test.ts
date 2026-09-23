/**
 * @zudojs/security — batch 5: CSRF checks return false for a bad token and
 * throw only for misconfiguration.
 */

import { describe, it, expect } from "vitest";
import { ConfigurationError } from "@zudojs/errors";

import {
  MIN_CSRF_SECRET_LENGTH,
  createCsrfProtection,
  extractCsrfTokenFromCookies,
  extractCsrfTokenFromHeaders,
  generateCsrfToken,
  requiresCsrfProtection,
  validateCsrfToken,
  verifyDoubleSubmit,
} from "../src/index.js";

const SECRET = "k".repeat(MIN_CSRF_SECRET_LENGTH);

/** The check a lesson writer wrote, with a correctly sized secret. */
function checkCsrf(
  method: string,
  headers: Record<string, string | string[] | undefined>,
  sessionId: string,
  secret: string,
): boolean {
  if (!requiresCsrfProtection(method)) return true;
  const fromCookie = extractCsrfTokenFromCookies(
    typeof headers["cookie"] === "string" ? headers["cookie"] : "",
  );
  const fromRequest = extractCsrfTokenFromHeaders(headers);
  return verifyDoubleSubmit(fromCookie, fromRequest, secret, { sessionId });
}

describe("a bad token is false, not a throw", () => {
  const token = generateCsrfToken(SECRET, { sessionId: "user-42" });

  it("the documented check returns false for missing and wrong tokens", () => {
    expect(checkCsrf("GET", {}, "user-42", SECRET)).toBe(true);
    expect(checkCsrf("POST", {}, "user-42", SECRET)).toBe(false);
    expect(
      checkCsrf("POST", { cookie: `_csrf=${token}`, "x-csrf-token": "nope" }, "user-42", SECRET),
    ).toBe(false);
    expect(
      checkCsrf("POST", { cookie: `_csrf=${token}`, "x-csrf-token": token }, "user-99", SECRET),
    ).toBe(false);
    expect(
      checkCsrf("POST", { cookie: `_csrf=${token}`, "x-csrf-token": token }, "user-42", SECRET),
    ).toBe(true);
  });

  it("non-string tokens from an untyped request are false", () => {
    const bogus = [123, ["a"], {}, null, true] as unknown as string[];
    for (const value of bogus) {
      expect(() => verifyDoubleSubmit(value, value, SECRET)).not.toThrow();
      expect(verifyDoubleSubmit(value, value, SECRET)).toBe(false);
      expect(validateCsrfToken(value, SECRET)).toBe(false);
    }
  });

  it("malformed request shapes fail closed", () => {
    const csrf = createCsrfProtection({ secret: SECRET });
    expect(csrf.verify(undefined as never)).toBe(false);
    expect(csrf.verify({} as never)).toBe(false);
    expect(csrf.verify({ method: "POST", headers: null as never, cookieHeader: 7 as never })).toBe(false);
    expect(requiresCsrfProtection(undefined as never)).toBe(true);
    expect(extractCsrfTokenFromCookies(undefined as never)).toBeUndefined();
    expect(extractCsrfTokenFromHeaders(null as never)).toBeUndefined();
    expect(extractCsrfTokenFromHeaders({ "x-csrf-token": [] })).toBeUndefined();
  });
});

describe("misconfiguration still throws", () => {
  it("a secret shorter than 32 characters is a ConfigurationError", () => {
    const short = "a-long-random-string";
    expect(short.length).toBeLessThan(MIN_CSRF_SECRET_LENGTH);
    expect(() => verifyDoubleSubmit("a", "a", short)).toThrow(ConfigurationError);
    expect(() => createCsrfProtection({ secret: short })).toThrow(ConfigurationError);
  });
});
