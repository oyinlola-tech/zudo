import { describe, it, expect, afterEach } from "vitest";
import type { CryptoProvider } from "../src/cryptoProvider/index.js";
import {
  getDefaultCryptoProvider,
  setDefaultCryptoProvider,
  resetDefaultCryptoProvider,
} from "../src/cryptoProvider/index.js";
import { createNodeCryptoProvider } from "../src/node/index.js";
import { hash } from "../src/cryptoHash/index.js";
import { createCryptoService } from "../src/cryptoService/index.js";
import { createCryptoFactory } from "../src/cryptoFactory/index.js";
import { createCryptoKey, generateCryptoKey } from "../src/cryptoKey/index.js";
import { CryptoAlgorithm } from "../src/cryptoConstants/index.js";
import { isCryptoError } from "@zudojs/errors";

function spyProvider(): CryptoProvider & { calls: string[] } {
  const base = createNodeCryptoProvider();
  const calls: string[] = [];
  return {
    ...base,
    name: "spy",
    calls,
    randomBytes: (n) => {
      calls.push("randomBytes");
      return base.randomBytes(n);
    },
    randomInt: (a, b) => base.randomInt(a, b),
    randomUUID: () => base.randomUUID(),
    hash: (a, d) => {
      calls.push("hash");
      return base.hash(a, d);
    },
    hmac: (a, k, d) => base.hmac(a, k, d),
    encrypt: (o) => base.encrypt(o),
    decrypt: (o) => base.decrypt(o),
    sign: (o) => base.sign(o),
    verify: (o) => base.verify(o),
    deriveKey: (o) => base.deriveKey(o),
    hashPassword: (p, o) => base.hashPassword(p, o),
    verifyPassword: (p, h) => base.verifyPassword(p, h),
  };
}

describe("provider injection", () => {
  afterEach(() => resetDefaultCryptoProvider());

  it("uses an explicitly supplied provider", async () => {
    const spy = spyProvider();
    await hash("x", { provider: spy });
    expect(spy.calls).toContain("hash");

    const service = createCryptoService({ provider: spy });
    expect(service.getProvider()).toBe(spy);
    await service.randomBytes(4);
    expect(spy.calls).toContain("randomBytes");

    const factory = createCryptoFactory({ provider: spy });
    expect(factory.getProvider()).toBe(spy);
    expect(factory.getService().getProvider()).toBe(spy);
  });

  it("setDefaultCryptoProvider swaps the default", async () => {
    const spy = spyProvider();
    setDefaultCryptoProvider(spy);
    expect(getDefaultCryptoProvider()).toBe(spy);
    await hash("y");
    expect(spy.calls).toContain("hash");
    resetDefaultCryptoProvider();
    expect(getDefaultCryptoProvider().name).toBe("node");
  });
});

describe("crypto keys", () => {
  it("validates key length for the declared algorithm", async () => {
    await expect(
      createCryptoKey(new Uint8Array([1, 2, 3, 4]), {
        algorithm: CryptoAlgorithm.AES_256_GCM,
      }),
    ).rejects.toSatisfy(isCryptoError);
    await expect(
      createCryptoKey(new Uint8Array(8), { algorithm: CryptoAlgorithm.HMAC_SHA256 }),
    ).rejects.toSatisfy(isCryptoError);
    await expect(
      createCryptoKey(new Uint8Array(32), { algorithm: CryptoAlgorithm.SHA_256 }),
    ).rejects.toSatisfy(isCryptoError);
    const key = await createCryptoKey(new Uint8Array(32), {
      algorithm: CryptoAlgorithm.AES_256_GCM,
    });
    expect(key.length).toBe(256);
    expect(key.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it("fingerprint is not a bare sha256 of the key", async () => {
    const bytes = new Uint8Array(32).fill(1);
    const key = await createCryptoKey(bytes, {
      algorithm: CryptoAlgorithm.AES_256_GCM,
    });
    const plain = Buffer.from(
      await createNodeCryptoProvider().hash("sha256", bytes),
    ).toString("hex");
    expect(key.fingerprint).not.toBe(plain);
  });

  it("generateKey rejects asymmetric algorithms", async () => {
    await expect(
      generateCryptoKey(32, { algorithm: CryptoAlgorithm.ED25519 }),
    ).rejects.toSatisfy(isCryptoError);
    const service = createCryptoService();
    await expect(service.generateKey(CryptoAlgorithm.ED25519)).rejects.toSatisfy(
      isCryptoError,
    );
    const factory = createCryptoFactory();
    await expect(factory.createKey(CryptoAlgorithm.ED25519)).rejects.toSatisfy(
      isCryptoError,
    );
    const hmacKey = await service.generateKey(CryptoAlgorithm.HMAC_SHA512);
    expect(hmacKey.length).toBe(512);
  });
});

describe("service error causes", () => {
  it("encrypt with a bad key carries the cause", async () => {
    const service = createCryptoService();
    let caught: unknown;
    try {
      await service.encrypt(new Uint8Array([1]), new Uint8Array(16));
    } catch (error) {
      caught = error;
    }
    expect(isCryptoError(caught)).toBe(true);
    expect((caught as { message: string }).message).toContain("32 bytes");
  });

  it("decode failures carry the cause", () => {
    const service = createCryptoService();
    let caught: unknown;
    try {
      service.decode("!!!", "hex");
    } catch (error) {
      caught = error;
    }
    expect(isCryptoError(caught)).toBe(true);
    expect((caught as { cause?: unknown }).cause).toBeInstanceOf(TypeError);
  });
});
