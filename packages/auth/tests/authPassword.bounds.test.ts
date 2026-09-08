import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  needsRehash,
  generateRandomToken,
  MAX_PASSWORD_BYTES,
  MIN_SALT_LENGTH,
  MAX_SALT_LENGTH,
  AuthError,
} from "../src/index.js";

// AUTH-17 — `hashPassword(pw, 0)` silently produced unsalted hashes.
describe("saltLength bounds", () => {
  const rejected: ReadonlyArray<[string, number]> = [
    ["zero (empty salt, identical hashes for identical passwords)", 0],
    ["negative", -1],
    ["fractional", 32.5],
    ["below the minimum", MIN_SALT_LENGTH - 1],
    ["above the maximum", MAX_SALT_LENGTH + 1],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
  ];

  for (const [label, saltLength] of rejected) {
    it(`rejects a saltLength that is ${label}`, async () => {
      await expect(hashPassword("password", saltLength)).rejects.toThrow(
        AuthError,
      );
    });
  }

  it("accepts the documented range", async () => {
    await expect(hashPassword("password", MIN_SALT_LENGTH)).resolves.toMatch(
      /^scrypt\$/,
    );
    await expect(hashPassword("password", MAX_SALT_LENGTH)).resolves.toMatch(
      /^scrypt\$/,
    );
  });

  it("no longer lets two users share a byte-identical hash", async () => {
    // With saltLength 0 these were equal; the salt is now guaranteed.
    const first = await hashPassword("shared-password", MIN_SALT_LENGTH);
    const second = await hashPassword("shared-password", MIN_SALT_LENGTH);
    expect(first).not.toBe(second);
  });

  it("flags a hypothetical unsalted hash for rehash", () => {
    expect(needsRehash("scrypt$16384$8$1$$deadbeef")).toBe(true);
  });
});

// AUTH-18 — no maximum password length on a public entry point.
describe("password length bounds", () => {
  const oversized = "p".repeat(MAX_PASSWORD_BYTES + 1);

  it("rejects an over-length password when hashing", async () => {
    await expect(hashPassword(oversized)).rejects.toThrow(AuthError);
  });

  it("treats an over-length password as a non-match when verifying", async () => {
    const hash = await hashPassword("password123");
    expect(await verifyPassword(oversized, hash)).toBe(false);
  });

  it("accepts a password at exactly the limit", async () => {
    const atLimit = "p".repeat(MAX_PASSWORD_BYTES);
    const hash = await hashPassword(atLimit);
    expect(await verifyPassword(atLimit, hash)).toBe(true);
  });

  it("counts bytes, not code units", async () => {
    // 4-byte characters: 300 of them are 1200 bytes, over the limit.
    await expect(hashPassword("🔐".repeat(300))).rejects.toThrow(AuthError);
  });

  it("never throws out of verifyPassword for junk input", async () => {
    expect(await verifyPassword("password", "not-a-hash-at-all")).toBe(false);
    expect(await verifyPassword(null as unknown as string, "x")).toBe(false);
    expect(await verifyPassword("password", null as unknown as string)).toBe(
      false,
    );
  });

  it("rejects a non-string password when hashing", async () => {
    await expect(hashPassword(undefined as unknown as string)).rejects.toThrow(
      AuthError,
    );
  });
});

describe("generateRandomToken bounds", () => {
  it("rejects out-of-range lengths", () => {
    expect(() => generateRandomToken(0)).toThrow(AuthError);
    expect(() => generateRandomToken(-1)).toThrow(AuthError);
    expect(() => generateRandomToken(1.5)).toThrow(AuthError);
    expect(() => generateRandomToken(2048)).toThrow(AuthError);
  });

  it("accepts the documented range", () => {
    expect(generateRandomToken(16)).toHaveLength(32);
    expect(generateRandomToken(1024)).toHaveLength(2048);
  });
});
