/**
 * Audit round 10 regressions for @zudojs/security: CSRF and error classes.
 */

import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { ConfigurationError, ValidationError } from "@zudojs/errors";

import {
  createCsrfProtection,
  generateCsrfToken,
  requiresCsrfProtection,
  serializeCookie,
  validateCsrfToken,
  verifyDoubleSubmit,
} from "../src/index.js";

const SECRET = "s".repeat(40);

describe("security/SEC-02", () => {
  it("lower-case configured methods still protect", () => {
    expect(requiresCsrfProtection("POST", { secret: SECRET, methods: ["post"] })).toBe(true);
    expect(requiresCsrfProtection("delete", { secret: SECRET, methods: ["Delete"] })).toBe(true);
    const csrf = createCsrfProtection({ secret: SECRET, methods: ["post", "delete"] });
    expect(csrf.verify({ method: "POST", headers: {} })).toBe(false);
    expect(csrf.requiresProtection("POST")).toBe(true);
  });
});

describe("security/SEC-04", () => {
  it("validation refuses an empty or short secret, like generation does", () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 600;
    const sig = createHmac("sha256", "").update(`${expiresAt}:abc:`).digest("base64url");
    const forged = `${expiresAt}:abc:${sig}`;
    expect(() => validateCsrfToken(forged, "")).toThrow(ConfigurationError);
    expect(() => validateCsrfToken(forged, "short")).toThrow(ConfigurationError);
    expect(() => verifyDoubleSubmit(forged, forged, "")).toThrow(ConfigurationError);
    expect(() => verifyDoubleSubmit(undefined, undefined, "")).toThrow(ConfigurationError);
  });

  it("a valid secret still round-trips", () => {
    const token = generateCsrfToken(SECRET, { sessionId: "s1" });
    expect(validateCsrfToken(token, SECRET, { sessionId: "s1" })).toBe(true);
  });
});

describe("security/CONV-02", () => {
  it("configuration and cookie failures throw @zudojs/errors classes", () => {
    expect(() => generateCsrfToken("")).toThrow(ConfigurationError);
    expect(() => createCsrfProtection({ secret: "" })).toThrow(ConfigurationError);
    expect(() => serializeCookie({ name: "bad name", value: "x" })).toThrow(ValidationError);
  });
});
