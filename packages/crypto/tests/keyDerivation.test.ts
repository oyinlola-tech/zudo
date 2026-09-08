import { describe, it, expect } from "vitest";
import {
  derivePbkdf2,
  deriveScrypt,
  deriveKey,
  generateSalt,
} from "../src/cryptoKeyDerivation/index.js";
import { CryptoAlgorithm } from "../src/cryptoConstants/index.js";

describe("derivePbkdf2", () => {
  it("derives a key from a password", async () => {
    const result = await derivePbkdf2("password123", {
      salt: new Uint8Array(16).fill(1),
    });
    expect(result.key).toBeInstanceOf(Uint8Array);
    expect(result.key.length).toBe(32);
    expect(result.salt.length).toBe(16);
  });

  it("generates salt when not provided", async () => {
    const result = await derivePbkdf2("password123");
    expect(result.salt.length).toBeGreaterThanOrEqual(16);
  });

  it("produces deterministic output with same salt", async () => {
    const salt = new Uint8Array(16).fill(42);
    const a = await derivePbkdf2("password", { salt, iterations: 100_000 });
    const b = await derivePbkdf2("password", { salt, iterations: 100_000 });
    expect(a.key).toEqual(b.key);
  });
});

describe("deriveScrypt", () => {
  it("derives a key from a password", async () => {
    const result = await deriveScrypt("password123", {
      salt: new Uint8Array(16).fill(1),
    });
    expect(result.key).toBeInstanceOf(Uint8Array);
    expect(result.key.length).toBe(32);
  });

  it("generates salt when not provided", async () => {
    const result = await deriveScrypt("password123");
    expect(result.salt.length).toBeGreaterThanOrEqual(16);
  });

  it("produces deterministic output with same salt", async () => {
    const salt = new Uint8Array(16).fill(42);
    const a = await deriveScrypt("password", { salt, cost: 1024 });
    const b = await deriveScrypt("password", { salt, cost: 1024 });
    expect(a.key).toEqual(b.key);
  });
});

describe("deriveKey", () => {
  it("routes to PBKDF2 for pbkdf2-sha256", async () => {
    const result = await deriveKey("password", CryptoAlgorithm.PBKDF2_SHA256, {
      salt: new Uint8Array(16).fill(1),
    });
    expect(result.key).toBeInstanceOf(Uint8Array);
    expect(result.key.length).toBe(32);
  });

  it("routes to scrypt for scrypt", async () => {
    const result = await deriveKey("password", CryptoAlgorithm.SCRYPT, {
      salt: new Uint8Array(16).fill(1),
    });
    expect(result.key).toBeInstanceOf(Uint8Array);
    expect(result.key.length).toBe(32);
  });

  it("throws for unsupported algorithm", async () => {
    await expect(
      deriveKey("password", "aes-256-gcm" as never),
    ).rejects.toThrow();
  });
});

describe("generateSalt", () => {
  it("generates salt of requested length", async () => {
    const salt = await generateSalt(16);
    expect(salt.length).toBe(16);
  });

  it("rejects lengths below 16", async () => {
    await expect(generateSalt(8)).rejects.toThrow();
  });
});
