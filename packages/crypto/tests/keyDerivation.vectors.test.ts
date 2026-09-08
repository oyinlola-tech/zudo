import { describe, it, expect } from "vitest";
import { pbkdf2Sync, scryptSync } from "node:crypto";
import {
  derivePbkdf2,
  deriveScrypt,
  deriveKey,
} from "../src/cryptoKeyDerivation/index.js";
import { CryptoAlgorithm } from "../src/cryptoConstants/index.js";
import { createNodeCryptoProvider } from "../src/node/index.js";
import { createCryptoService } from "../src/cryptoService/index.js";
import { isCryptoError } from "@zudojs/errors";

const salt = new Uint8Array(16).fill(0x5a);

describe("PBKDF2 digest is honoured", () => {
  for (const digest of ["sha256", "sha384", "sha512"] as const) {
    it(`matches node pbkdf2Sync for ${digest}`, async () => {
      const result = await derivePbkdf2("pw", {
        salt,
        iterations: 100_000,
        digest,
      });
      const expected = pbkdf2Sync("pw", salt, 100_000, 32, digest);
      expect(Buffer.from(result.key)).toEqual(expected);
      expect(result.algorithm).toBe(`pbkdf2-${digest}`);
      expect(result.digest).toBe(digest);
    });
  }

  it("deriveKey routes sha512 and sha384 correctly", async () => {
    const r512 = await deriveKey("pw", CryptoAlgorithm.PBKDF2_SHA512, {
      salt,
      iterations: 100_000,
    });
    expect(Buffer.from(r512.key)).toEqual(
      pbkdf2Sync("pw", salt, 100_000, 32, "sha512"),
    );
    expect(r512.algorithm).toBe(CryptoAlgorithm.PBKDF2_SHA512);

    const r384 = await deriveKey("pw", CryptoAlgorithm.PBKDF2_SHA384, {
      salt,
      iterations: 100_000,
    });
    expect(r384.algorithm).toBe(CryptoAlgorithm.PBKDF2_SHA384);
  });

  it("uses 600000 iterations by default", async () => {
    const result = await derivePbkdf2("pw", { salt, keyLength: 16 });
    expect(Buffer.from(result.key)).toEqual(
      pbkdf2Sync("pw", salt, 600_000, 16, "sha256"),
    );
  });

  it("rejects unsupported digests", async () => {
    await expect(
      derivePbkdf2("pw", { salt, digest: "md5" as never }),
    ).rejects.toThrow(TypeError);
  });
});

describe("scrypt parameters are honoured", () => {
  it("matches node scryptSync with r != 8", async () => {
    const result = await deriveScrypt("pw", {
      salt,
      cost: 1024,
      blockSize: 4,
      parallelization: 2,
    });
    expect(Buffer.from(result.key)).toEqual(
      scryptSync("pw", salt, 32, { N: 1024, r: 4, p: 2 }),
    );
    expect(result.algorithm).toBe(CryptoAlgorithm.SCRYPT);
  });

  it("supports cost >= 32768 without an explicit maxMemory", async () => {
    const result = await deriveScrypt("pw", { salt, cost: 2 ** 17 });
    expect(Buffer.from(result.key)).toEqual(
      scryptSync("pw", salt, 32, { N: 2 ** 17, r: 8, p: 1, maxmem: 512 * 1024 * 1024 }),
    );
  }, 30_000);

  it("wraps parameter errors as CryptoError with cause", async () => {
    const provider = createNodeCryptoProvider();
    let caught: unknown;
    try {
      await provider.deriveKey({
        password: "pw",
        salt,
        algorithm: "scrypt",
        memoryCost: 2 ** 16,
        maxMemory: 1024,
      });
    } catch (error) {
      caught = error;
    }
    expect(isCryptoError(caught)).toBe(true);
    expect((caught as { cause?: unknown }).cause).toBeInstanceOf(Error);
  });

  it("service wrapper preserves cause", async () => {
    const service = createCryptoService();
    let caught: unknown;
    try {
      await service.deriveKey("pw", CryptoAlgorithm.SCRYPT, {
        salt,
        cost: 2 ** 16,
        maxMemory: 1024,
      });
    } catch (error) {
      caught = error;
    }
    expect(isCryptoError(caught)).toBe(true);
    expect((caught as { cause?: unknown }).cause).toBeDefined();
  });

  it("service honours blockSize", async () => {
    const service = createCryptoService();
    const result = await service.deriveKey("pw", CryptoAlgorithm.SCRYPT, {
      salt,
      cost: 1024,
      blockSize: 16,
    });
    expect(Buffer.from(result.key)).toEqual(
      scryptSync("pw", salt, 32, { N: 1024, r: 16, p: 1 }),
    );
  });
});

describe("provider-level floors", () => {
  it("rejects empty salts and trivial iteration counts", async () => {
    const provider = createNodeCryptoProvider();
    await expect(
      provider.deriveKey({
        password: "pw",
        salt: new Uint8Array(0),
        algorithm: "pbkdf2",
        iterations: 100_000,
      }),
    ).rejects.toSatisfy(isCryptoError);
    await expect(
      provider.deriveKey({
        password: "pw",
        salt,
        algorithm: "pbkdf2",
        iterations: 1,
      }),
    ).rejects.toSatisfy(isCryptoError);
    await expect(
      provider.hashPassword("pw", { salt: new Uint8Array(1) }),
    ).rejects.toThrow();
  });
});
