/**
 * Audit round 10 regressions for @zudojs/crypto.
 */

import { describe, it, expect } from "vitest";
import { CryptoError } from "@zudojs/errors";
import { randomBytes, scryptSync } from "node:crypto";

import { hashPassword, verifyPassword } from "../src/cryptoPassword/index.js";
import { PASSWORD_HASH } from "../src/cryptoConstants/index.js";
import { createNodeCryptoProvider } from "../src/node/index.js";

describe("security/CRYPTO-01", () => {
  it("new password hashes default to OWASP N=2^14, r=8, p=5", async () => {
    const result = await hashPassword("correct horse");
    expect([result.cost, result.blockSize, result.parallelization]).toEqual([16_384, 8, 5]);
    expect(result.encoded.startsWith("v1$scrypt$16384$8$5$")).toBe(true);
    expect(await verifyPassword("correct horse", result.encoded)).toBe(true);
  });

  it("refuses to mint a hash below the cost floor, on both entry points", async () => {
    await expect(hashPassword("pw", { cost: 2 })).rejects.toThrow(CryptoError);
    await expect(hashPassword("pw", { cost: 8_192 })).rejects.toThrow(CryptoError);
    const provider = createNodeCryptoProvider();
    await expect(
      provider.hashPassword("pw", { algorithm: "scrypt", memoryCost: 2 }),
    ).rejects.toThrow(CryptoError);
  });

  it("still verifies older stored hashes with a smaller cost", async () => {
    const salt = randomBytes(16);
    const key = scryptSync("pw", salt, 32, { N: 1024, r: 8, p: 1 });
    const encoded = `v1$scrypt$1024$8$1$${salt.toString("base64url")}.${key.toString("base64url")}`;
    expect(await verifyPassword("pw", encoded)).toBe(true);
  });

  it("key derivation defaults are unchanged (p stays 1)", () => {
    expect(PASSWORD_HASH.SCRYPT.PARALLELIZATION).toBe(1);
    expect(PASSWORD_HASH.SCRYPT.MIN_COST).toBe(16_384);
  });
});
