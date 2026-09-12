/**
 * Regression tests for the round-9 audit findings (CRYPTO-R9-*).
 */

import { describe, it, expect } from "vitest";

import {
  PASSWORD_HASH,
  validateScryptOptions,
  validatePbkdf2Options,
  derivePbkdf2,
  deriveScrypt,
  createNodeCryptoProvider,
  isCryptoError,
} from "../src/index.js";

const salt = new Uint8Array(16).fill(7);
const LIMITS = PASSWORD_HASH.LIMITS;

describe("CRYPTO-R9-01: key derivation enforces the documented upper bounds", () => {
  it("exposes MAX_DERIVED_KEY_BYTES alongside the other limits", () => {
    expect(LIMITS.MAX_DERIVED_KEY_BYTES).toBe(1024);
  });

  it("validateScryptOptions rejects cost, blockSize, parallelization and keyLength above LIMITS", () => {
    expect(() => validateScryptOptions(32, 2 ** 30, 8, 1, salt)).toThrow(
      RangeError,
    );
    expect(() =>
      validateScryptOptions(32, LIMITS.MAX_SCRYPT_COST * 2, 8, 1, salt),
    ).toThrow(/cost/);
    expect(() =>
      validateScryptOptions(
        32,
        2 ** 14,
        LIMITS.MAX_SCRYPT_BLOCK_SIZE + 1,
        1,
        salt,
      ),
    ).toThrow(/blockSize/);
    expect(() =>
      validateScryptOptions(
        32,
        2 ** 14,
        8,
        LIMITS.MAX_SCRYPT_PARALLELIZATION + 1,
        salt,
      ),
    ).toThrow(/parallelization/);
    expect(() =>
      validateScryptOptions(LIMITS.MAX_DERIVED_KEY_BYTES + 1, 2 ** 14, 8, 1, salt),
    ).toThrow(/keyLength/);
  });

  it("validateScryptOptions rejects a cost * blockSize product over the memory bound", () => {
    // 128 * 2^14 * 1024 = 2 GiB: each factor is individually fine (r would
    // not be, but the product check must fire even when it is not).
    expect(() => validateScryptOptions(32, 2 ** 20, 16, 1, salt)).toThrow(
      /memory bound/,
    );
    // Exactly the bound (1 GiB) is still accepted.
    expect(() => validateScryptOptions(32, 2 ** 20, 8, 1, salt)).not.toThrow();
  });

  it("validatePbkdf2Options rejects iterations and keyLength above LIMITS", () => {
    expect(() =>
      validatePbkdf2Options(LIMITS.MAX_PBKDF2_ITERATIONS + 1, 32, salt),
    ).toThrow(/iterations/);
    expect(() =>
      validatePbkdf2Options(600_000, LIMITS.MAX_DERIVED_KEY_BYTES + 1, salt),
    ).toThrow(/keyLength/);
    expect(() =>
      validatePbkdf2Options(LIMITS.MAX_PBKDF2_ITERATIONS, 1024, salt),
    ).not.toThrow();
  });

  it("derivePbkdf2 / deriveScrypt refuse out-of-bounds work before deriving", async () => {
    await expect(
      derivePbkdf2("pw", { iterations: LIMITS.MAX_PBKDF2_ITERATIONS + 1, salt }),
    ).rejects.toThrow(RangeError);
    await expect(
      deriveScrypt("pw", { cost: 2 ** 14, blockSize: 1024, salt }),
    ).rejects.toThrow(RangeError);
    await expect(
      deriveScrypt("pw", { cost: 2 ** 30, salt }),
    ).rejects.toThrow(RangeError);
  });

  it("the Node provider enforces the same ceilings at its own boundary", async () => {
    const provider = createNodeCryptoProvider();

    const cases = [
      { algorithm: "pbkdf2", iterations: LIMITS.MAX_PBKDF2_ITERATIONS + 1 },
      { algorithm: "pbkdf2", keyLength: LIMITS.MAX_DERIVED_KEY_BYTES + 1 },
      { algorithm: "scrypt", memoryCost: 2 ** 30 },
      { algorithm: "scrypt", blockSize: LIMITS.MAX_SCRYPT_BLOCK_SIZE + 1 },
      { algorithm: "scrypt", parallelism: LIMITS.MAX_SCRYPT_PARALLELIZATION + 1 },
      { algorithm: "scrypt", memoryCost: 2 ** 20, blockSize: 16 },
      { algorithm: "scrypt", keyLength: LIMITS.MAX_DERIVED_KEY_BYTES + 1 },
    ] as const;

    for (const options of cases) {
      let thrown: unknown;
      try {
        await provider.deriveKey({ password: "pw", salt, ...options });
      } catch (error) {
        thrown = error;
      }
      expect(thrown, JSON.stringify(options)).toBeDefined();
      expect(isCryptoError(thrown)).toBe(true);
    }
  });

  it("still derives keys longer than a password hash allows, up to the new ceiling", async () => {
    const result = await derivePbkdf2("pw", {
      iterations: PASSWORD_HASH.PBKDF2.MIN_ITERATIONS,
      keyLength: 128,
      salt,
    });
    expect(result.key.byteLength).toBe(128);

    const scrypt = await deriveScrypt("pw", {
      cost: 2 ** 10,
      keyLength: 256,
      salt,
    });
    expect(scrypt.key.byteLength).toBe(256);
  });
});
