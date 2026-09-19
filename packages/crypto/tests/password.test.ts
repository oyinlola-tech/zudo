import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  decodePasswordHash,
  encodePasswordHash,
  isPasswordHash,
  isValidPassword,
} from "../src/cryptoPassword/index.js";

describe("hashPassword", async () => {
  it("hashes a password", async () => {
    const result = await hashPassword("mySecurePassword123");
    expect(result.encoded).toMatch(/^v1\$scrypt\$/);
    expect(result.salt.length).toBeGreaterThanOrEqual(16);
    expect(result.hash.length).toBeGreaterThanOrEqual(16);
  });

  it("returns default parameters", async () => {
    const result = await hashPassword("mySecurePassword123");
    expect(result.cost).toBe(16384);
    expect(result.blockSize).toBe(8);
    expect(result.parallelization).toBe(5);
  });
});

describe("verifyPassword", async () => {
  it("verifies a correct password", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    const valid = await verifyPassword(
      "correct-horse-battery-staple",
      hash.encoded,
    );
    expect(valid).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    const valid = await verifyPassword("wrong-password", hash.encoded);
    expect(valid).toBe(false);
  });

  it("returns false for malformed hash", async () => {
    const valid = await verifyPassword("password", "not-a-valid-hash");
    expect(valid).toBe(false);
  });
});

describe("decodePasswordHash", () => {
  it("decodes a valid password hash", async () => {
    const hash = await hashPassword("test-password");
    const decoded = decodePasswordHash(hash.encoded);
    expect(decoded.version).toBe("v1");
    expect(decoded.algorithm).toBe("scrypt");
    expect(decoded.salt.length).toBeGreaterThan(0);
    expect(decoded.hash.length).toBeGreaterThan(0);
  });

  it("throws for invalid hash format", () => {
    expect(() => decodePasswordHash("invalid")).toThrow();
  });
});

describe("encodePasswordHash", () => {
  it("encodes parameters back to string", async () => {
    const hash = await hashPassword("test-password");
    const encoded = encodePasswordHash(hash);
    expect(encoded).toMatch(/^v1\$scrypt\$/);
  });
});

describe("isPasswordHash", () => {
  it("returns true for valid hash", async () => {
    const hash = await hashPassword("test");
    expect(isPasswordHash(hash.encoded)).toBe(true);
  });

  it("returns false for invalid string", () => {
    expect(isPasswordHash("not-a-hash")).toBe(false);
  });
});

describe("isValidPassword", () => {
  it("returns true for valid password", () => {
    expect(isValidPassword("secure123")).toBe(true);
  });

  it("returns false for short password", () => {
    expect(isValidPassword("short")).toBe(false);
  });

  it("returns false for empty password", () => {
    expect(isValidPassword("")).toBe(false);
  });
});
