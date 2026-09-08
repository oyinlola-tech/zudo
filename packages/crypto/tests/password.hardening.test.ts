import { describe, it, expect } from "vitest";
import { pbkdf2Sync, scryptSync } from "node:crypto";
import {
  hashPassword,
  verifyPassword,
  decodePasswordHash,
  encodePasswordHash,
} from "../src/cryptoPassword/index.js";
import { CryptoAlgorithm, PASSWORD_POLICY } from "../src/cryptoConstants/index.js";
import { createNodeCryptoProvider } from "../src/node/index.js";
import { createCryptoService } from "../src/cryptoService/index.js";
import { createCryptoFactory } from "../src/cryptoFactory/index.js";

describe("hashPassword salt/key options", () => {
  it("returns the salt and hash that are inside encoded", async () => {
    const result = await hashPassword("pw", { saltBytes: 32, keyBytes: 64 });
    expect(result.salt.length).toBe(32);
    expect(result.hash.length).toBe(64);

    const decoded = decodePasswordHash(result.encoded);
    expect(decoded.algorithm).toBe(CryptoAlgorithm.SCRYPT);
    expect(decoded.salt).toEqual(result.salt);
    expect(decoded.hash).toEqual(result.hash);

    expect(encodePasswordHash(result)).toBe(result.encoded);
    expect(await verifyPassword("pw", encodePasswordHash(result))).toBe(true);
  });

  it("derives exactly scrypt(N, r, p) over the encoded salt", async () => {
    const result = await hashPassword("pw", { cost: 1024, blockSize: 4 });
    expect(Buffer.from(result.hash)).toEqual(
      scryptSync("pw", result.salt, 32, { N: 1024, r: 4, p: 1 }),
    );
  });

  it("enforces the maximum password length", async () => {
    const long = "a".repeat(PASSWORD_POLICY.MAX_LENGTH + 1);
    await expect(hashPassword(long)).rejects.toThrow(RangeError);
    expect(await verifyPassword(long, "v1$scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")).toBe(false);
  });

  it("rejects out-of-bounds work factors", async () => {
    await expect(hashPassword("pw", { cost: 2 ** 21 })).rejects.toThrow(RangeError);
    await expect(hashPassword("pw", { parallelization: 64 })).rejects.toThrow(RangeError);
    // Individually in range, but 128 * N * r = 4 GiB.
    await expect(
      hashPassword("pw", { cost: 2 ** 20, blockSize: 32 }),
    ).rejects.toThrow(/memory bound/);
    expect(
      await verifyPassword(
        "pw",
        "v1$scrypt$1048576$32$1$AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      ),
    ).toBe(false);
  });
});

describe("verifyPassword fails closed", () => {
  const cases = [
    "v1$scrypt$3$8$1$AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    "v1$scrypt$abc$8$1$AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    "v1$scrypt$1099511627776$8$1$AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    "v1$scrypt$0$8$1$AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    "v1$scrypt$16384$8$1$AAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    "v1$scrypt$16384$0$1$AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    "v1$scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA.",
    "v1$argon2id$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    "v1$bogus$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    "v1$scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA.AAAA",
    "v1$scrypt$2$8$20000$AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    "not-a-valid-hash",
    "",
  ];

  for (const stored of cases) {
    it(`returns false for ${JSON.stringify(stored).slice(0, 40)}`, async () => {
      expect(await verifyPassword("pw", stored)).toBe(false);
      const service = createCryptoService();
      expect(await service.verifyPassword("pw", stored)).toBe(false);
      const factory = createCryptoFactory();
      expect(await factory.verifyPassword("pw", stored)).toBe(false);
    });
  }

  it("returns false for non-string hash at the provider", async () => {
    const provider = createNodeCryptoProvider();
    expect(await provider.verifyPassword("pw", 42 as never)).toBe(false);
  });

  it("service throws TypeError for non-string arguments", async () => {
    const service = createCryptoService();
    await expect(service.verifyPassword(undefined as never, "x")).rejects.toThrow(
      TypeError,
    );
    await expect(service.verifyToken("x", undefined as never)).rejects.toThrow(
      TypeError,
    );
  });
});

describe("PBKDF2 password hashes", () => {
  it("round-trips through the provider and stores iterations", async () => {
    const provider = createNodeCryptoProvider();
    const encoded = await provider.hashPassword("pw", {
      algorithm: "pbkdf2",
      timeCost: 120_000,
    });
    expect(encoded).toMatch(/^v1\$pbkdf2-sha256\$120000\$/);
    expect(await provider.verifyPassword("pw", encoded)).toBe(true);
    expect(await provider.verifyPassword("nope", encoded)).toBe(false);
    expect(await verifyPassword("pw", encoded)).toBe(true);

    const decoded = decodePasswordHash(encoded);
    expect(decoded.algorithm).toBe(CryptoAlgorithm.PBKDF2_SHA256);
    if (decoded.algorithm !== CryptoAlgorithm.PBKDF2_SHA256) throw new Error();
    expect(decoded.iterations).toBe(120_000);
    expect(Buffer.from(decoded.hash)).toEqual(
      pbkdf2Sync("pw", decoded.salt, 120_000, 32, "sha256"),
    );
    expect(encodePasswordHash(decoded)).toBe(encoded);
  });

  it("honours the digest option", async () => {
    const provider = createNodeCryptoProvider();
    const encoded = await provider.hashPassword("pw", {
      algorithm: "pbkdf2",
      timeCost: 100_000,
      digest: "sha512",
    });
    expect(encoded).toMatch(/^v1\$pbkdf2-sha512\$/);
    expect(await provider.verifyPassword("pw", encoded)).toBe(true);
  });
});

describe("CryptoFactory password defaults", () => {
  it("merges per-call options on top of configured defaults", async () => {
    const factory = createCryptoFactory({ password: { cost: 1024 } });
    const result = await factory.createPasswordHash("pw", { keyBytes: 48 });
    expect(result.cost).toBe(1024);
    expect(result.hash.length).toBe(48);
  });

  it("copies option objects so callers cannot mutate configuration", () => {
    const password = { cost: 1024 };
    const factory = createCryptoFactory({ password });
    password.cost = 4096;
    expect(factory.getOptions().password.cost).toBe(1024);
  });

  it("rejects utf8 as a factory encoding", () => {
    expect(() => createCryptoFactory({ encoding: "utf8" as never })).toThrow(
      TypeError,
    );
  });
});
