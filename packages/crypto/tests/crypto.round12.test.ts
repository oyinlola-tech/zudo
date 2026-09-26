/**
 * Round 12 regressions for @zudojs/crypto (academy findings #84, #85, #86,
 * #87, #88 and the crypto half of #117).
 */

import { describe, it, expect } from "vitest";
import { CryptoError, ErrorCode, isCryptoError } from "@zudojs/errors";

import {
  encrypt,
  decrypt,
  sign,
  verify,
  signString,
  verifyString,
  hashPassword,
  verifyPassword,
  hmacSha256,
  hmac,
  generateEd25519KeyPair,
  generateCryptoKey,
  generateSalt,
  deriveScrypt,
  CryptoAlgorithm,
  PASSWORD_POLICY,
  randomHex,
  randomBase64Url,
} from "../src/index.js";

const KEY = new Uint8Array(32).fill(7);
const OTHER_KEY = new Uint8Array(32).fill(9);

describe("#84 sign/verify accept KeyObject keys", () => {
  it("signs and verifies with the KeyObjects generateEd25519KeyPair returns", async () => {
    const { privateKey, publicKey } = generateEd25519KeyPair();
    const data = new Uint8Array([1, 2, 3]);

    const signature = await sign(data, privateKey);
    expect(await verify(data, signature, publicKey)).toBe(true);

    const textSignature = await signString("hello", privateKey);
    expect(await verifyString("hello", textSignature, publicKey)).toBe(true);
    expect(await verifyString("hellp", textSignature, publicKey)).toBe(false);
  });
});

describe("#85 caller-supplied GCM IV reuse guard", () => {
  it("rejects a second encryption under the same key and iv", async () => {
    const iv = new Uint8Array(12).fill(1);
    const first = await encrypt(new Uint8Array([1]), KEY, { iv });
    expect(first.iv).toEqual(iv);

    await expect(
      encrypt(new Uint8Array([2]), KEY, { iv }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isCryptoError(error) && error.code === ErrorCode.CRYPTO_CIPHER,
    );
  });

  it("allows the same iv under a different key", async () => {
    const iv = new Uint8Array(12).fill(2);
    await encrypt(new Uint8Array([1]), KEY, { iv });
    const result = await encrypt(new Uint8Array([1]), OTHER_KEY, { iv });
    expect(result.iv).toEqual(iv);
  });

  it("unsafeAllowIvReuse opts out of the guard", async () => {
    const iv = new Uint8Array(12).fill(3);
    await encrypt(new Uint8Array([1]), KEY, { iv });
    const result = await encrypt(new Uint8Array([1]), KEY, {
      iv,
      unsafeAllowIvReuse: true,
    });
    const plaintext = await decrypt(result.ciphertext, KEY, iv, result.authTag);
    expect(Array.from(plaintext)).toEqual([1]);
  });

  it("random ivs are never rejected", async () => {
    for (let index = 0; index < 20; index += 1) {
      await encrypt(new Uint8Array([index]), KEY);
    }
  });
});

describe("#86 units are stated and exposed", () => {
  it("CryptoKey reports both bits and bytes", async () => {
    const key = await generateCryptoKey(32, {
      algorithm: CryptoAlgorithm.AES_256_GCM,
    });
    expect(key.byteLength).toBe(32);
    expect(key.length).toBe(256);
  });

  it("randomHex counts characters while randomBase64Url counts bytes", async () => {
    expect((await randomHex(32)).length).toBe(32);
    expect((await randomBase64Url(32)).length).toBe(43);
  });
});

describe("#87 parameter violations throw CryptoError, not RangeError", () => {
  it("short HMAC key", async () => {
    const error = await hmacSha256("x", new Uint8Array(8)).catch((e) => e);
    expect(error).toBeInstanceOf(CryptoError);
    expect(error).not.toBeInstanceOf(RangeError);
    expect(error.code).toBe(ErrorCode.CRYPTO_HASH);
  });

  it("low scrypt cost for a new password hash", async () => {
    const error = await hashPassword("pw", { cost: 2 }).catch((e) => e);
    expect(error).toBeInstanceOf(CryptoError);
    expect(error.code).toBe(ErrorCode.CRYPTO_HASH);
  });

  it("over-long password is a user-facing 400", async () => {
    const long = "a".repeat(PASSWORD_POLICY.MAX_LENGTH + 1);
    const error = await hashPassword(long).catch((e) => e);
    expect(error).toBeInstanceOf(CryptoError);
    expect(error.statusCode).toBe(400);
    expect(error.expose).toBe(true);
  });

  it("key derivation bounds and salt length", async () => {
    const salt = new Uint8Array(16);
    await expect(deriveScrypt("pw", { cost: 2 ** 30, salt })).rejects.toSatisfy(
      (error: unknown) =>
        isCryptoError(error) && error.code === ErrorCode.CRYPTO_DERIVATION,
    );
    await expect(generateSalt(8)).rejects.toBeInstanceOf(CryptoError);
    await expect(
      generateCryptoKey(0, { algorithm: CryptoAlgorithm.AES_256_GCM }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isCryptoError(error) && error.code === ErrorCode.CRYPTO_KEY,
    );
  });
});

describe("#88 hashPassword minimum length policy", () => {
  it("still accepts short passwords by default (backwards compatible)", async () => {
    const result = await hashPassword("abc");
    expect(await verifyPassword("abc", result.encoded)).toBe(true);
  });

  it("rejects passwords shorter than minLength with a user-facing CryptoError", async () => {
    const error = await hashPassword("abc", {
      minLength: PASSWORD_POLICY.MIN_LENGTH,
    }).catch((e) => e);
    expect(error).toBeInstanceOf(CryptoError);
    expect(error.message).toMatch(/at least 8 characters/);
    expect(error.statusCode).toBe(400);
    expect(error.expose).toBe(true);

    const ok = await hashPassword("long-enough-password", {
      minLength: PASSWORD_POLICY.MIN_LENGTH,
    });
    expect(ok.encoded.startsWith("v1$scrypt$")).toBe(true);
  });

  it("rejects an invalid minLength", async () => {
    await expect(hashPassword("abcdefgh", { minLength: 0 })).rejects.toThrow(
      RangeError,
    );
    await expect(
      hashPassword("abcdefgh", { minLength: PASSWORD_POLICY.MAX_LENGTH + 1 }),
    ).rejects.toThrow(RangeError);
  });
});

describe("#117 HMAC key must be bytes", () => {
  it("names the conversion when handed a string secret", async () => {
    const error = await hmac(
      "x",
      "a-string-secret-of-some-length" as unknown as Uint8Array,
    ).catch((e) => e);
    expect(error).toBeInstanceOf(TypeError);
    expect(error.message).toMatch(/TextEncoder|Buffer\.from/);
  });
});
