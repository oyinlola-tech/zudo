import { describe, expect, it } from "vitest";

import {
  assertValidCodeVerifier,
  deriveCodeChallenge,
  generateCodeVerifier,
  OAuthErrorCode,
  OAuthError,
} from "../src/index.js";

describe("PKCE", () => {
  it("matches the RFC 7636 Appendix B S256 test vector", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(deriveCodeChallenge(verifier)).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });

  it("generates verifiers in the unreserved alphabet within the legal length", () => {
    for (let i = 0; i < 200; i += 1) {
      const verifier = generateCodeVerifier();
      expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
      expect(verifier.length).toBeGreaterThanOrEqual(43);
      expect(verifier.length).toBeLessThanOrEqual(128);
    }
  });

  it("generates a different verifier every time", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i += 1) seen.add(generateCodeVerifier());
    expect(seen.size).toBe(500);
  });

  it("derives a stable, url-safe challenge", () => {
    const verifier = generateCodeVerifier();
    const challenge = deriveCodeChallenge(verifier);
    expect(challenge).toBe(deriveCodeChallenge(verifier));
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge).not.toBe(verifier);
  });

  it.each([
    ["too short", "abc"],
    ["too long", "a".repeat(129)],
    ["illegal character", `${"a".repeat(42)}+`],
    ["empty", ""],
  ])("rejects a %s verifier", (_label, verifier) => {
    expect(() => {
      assertValidCodeVerifier(verifier);
    }).toThrow(OAuthError);
    try {
      assertValidCodeVerifier(verifier);
    } catch (error) {
      expect((error as OAuthError).code).toBe(OAuthErrorCode.PKCE_INVALID);
      // The verifier is a secret; it must not be echoed back.
      if (verifier.length > 0) {
        expect((error as OAuthError).message).not.toContain(verifier);
      }
    }
  });
});
