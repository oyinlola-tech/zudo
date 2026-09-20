/**
 * Audit round 11 regressions for @zudojs/crypto.
 */

import { describe, it, expect, afterEach } from "vitest";
import { CryptoError, isCryptoError } from "@zudojs/errors";

import type { CryptoProvider } from "../src/cryptoProvider/index.js";
import type { CryptoCapabilities } from "../src/cryptoProvider/index.js";
import {
  resetDefaultCryptoProvider,
  setDefaultCryptoProvider,
} from "../src/cryptoProvider/index.js";
import { createNodeCryptoProvider } from "../src/node/index.js";
import { hash } from "../src/cryptoHash/index.js";
import { hmac } from "../src/cryptoHash/index.js";
import { encrypt, decrypt } from "../src/cryptoCipher/index.js";
import { sign, verify } from "../src/cryptoSignature/index.js";
import { hashPassword, verifyPassword } from "../src/cryptoPassword/index.js";
import {
  derivePbkdf2,
  deriveScrypt,
} from "../src/cryptoKeyDerivation/index.js";
import { randomBytesSecure, randomHex } from "../src/cryptoRandom/index.js";

/** The Node provider with one capability flag turned off. */
function providerWithout(disabled: keyof CryptoCapabilities): CryptoProvider {
  const base = createNodeCryptoProvider();
  const capabilities: CryptoCapabilities = {
    ...base.capabilities,
    [disabled]: false,
  };
  return Object.assign(Object.create(Object.getPrototypeOf(base) as object), {
    ...base,
    name: "limited",
    capabilities,
  }) as CryptoProvider;
}

afterEach(() => {
  resetDefaultCryptoProvider();
});

describe("SEC-05 — declared capabilities are consulted", () => {
  it("refuses to hash a password on a provider that declares passwordHashing: false", async () => {
    const provider = providerWithout("passwordHashing");
    await expect(
      hashPassword("correct horse battery", { provider }),
    ).rejects.toThrow(CryptoError);
    await expect(
      hashPassword("correct horse battery", { provider }),
    ).rejects.toThrow(/passwordHashing/);
  });

  it("refuses to verify a password rather than answering `false`", async () => {
    const real = await hashPassword("correct horse battery");
    const provider = providerWithout("passwordHashing");
    await expect(
      verifyPassword("correct horse battery", real.encoded, provider),
    ).rejects.toThrow(CryptoError);
  });

  it("refuses to sign or verify on a provider that declares signing: false", async () => {
    const provider = providerWithout("signing");
    const data = new TextEncoder().encode("payload");
    const key =
      "-----BEGIN PRIVATE KEY-----\nnot-a-key\n-----END PRIVATE KEY-----";

    await expect(sign(data, key, { provider })).rejects.toThrow(/signing/);
    await expect(
      verify(data, new Uint8Array(64), key, { provider }),
    ).rejects.toThrow(/signing/);
  });

  it("refuses to encrypt or decrypt on a provider that declares encryption: false", async () => {
    const provider = providerWithout("encryption");
    const key = new Uint8Array(32).fill(7);
    await expect(
      encrypt(new TextEncoder().encode("hi"), key, { provider }),
    ).rejects.toThrow(/encryption/);
    await expect(
      decrypt(
        new Uint8Array(4),
        key,
        new Uint8Array(12),
        new Uint8Array(16),
        undefined,
        provider,
      ),
    ).rejects.toThrow(/encryption/);
  });

  it("refuses hash, hmac, random and key derivation the same way", async () => {
    await expect(
      hash("x", { provider: providerWithout("hash") }),
    ).rejects.toThrow(/hash/);
    await expect(
      hmac("x", new Uint8Array(32), "sha256", "hex", providerWithout("hmac")),
    ).rejects.toThrow(/hmac/);
    await expect(
      randomBytesSecure(8, providerWithout("random")),
    ).rejects.toThrow(/random/);
    await expect(randomHex(16, providerWithout("random"))).rejects.toThrow(
      /random/,
    );
    await expect(
      derivePbkdf2("pw", { provider: providerWithout("keyDerivation") }),
    ).rejects.toThrow(/keyDerivation/);
    await expect(
      deriveScrypt("pw", { provider: providerWithout("keyDerivation") }),
    ).rejects.toThrow(/keyDerivation/);
  });

  it("raises a CryptoError, not a bare TypeError", async () => {
    const provider = providerWithout("hash");
    const error = await hash("x", { provider }).catch((e: unknown) => e);
    expect(isCryptoError(error)).toBe(true);
  });

  it("leaves a fully capable provider working", async () => {
    const provider = createNodeCryptoProvider();
    const digest = await hash("x", { provider });
    expect(digest.encoded).toMatch(/^[0-9a-f]{64}$/);
    const stored = await hashPassword("pw-abcdefghij", { provider });
    expect(
      await verifyPassword("pw-abcdefghij", stored.encoded, provider),
    ).toBe(true);
  });
});

describe("SEC-05 — setDefaultCryptoProvider validates the provider", () => {
  it("rejects an empty object at install instead of at first use", () => {
    expect(() =>
      setDefaultCryptoProvider({} as unknown as CryptoProvider),
    ).toThrow(CryptoError);
  });

  it("names the first missing method", () => {
    expect(() =>
      setDefaultCryptoProvider({} as unknown as CryptoProvider),
    ).toThrow(/randomBytes/);
  });

  it("rejects a provider missing a single method", () => {
    const base = createNodeCryptoProvider();
    const partial = {
      name: "partial",
      capabilities: base.capabilities,
      randomBytes: base.randomBytes.bind(base),
      randomInt: base.randomInt.bind(base),
      randomUUID: base.randomUUID.bind(base),
      hash: base.hash.bind(base),
      hmac: base.hmac.bind(base),
      encrypt: base.encrypt.bind(base),
      decrypt: base.decrypt.bind(base),
      sign: base.sign.bind(base),
      verify: base.verify.bind(base),
      deriveKey: base.deriveKey.bind(base),
      hashPassword: base.hashPassword.bind(base),
    } as unknown as CryptoProvider;
    expect(() => setDefaultCryptoProvider(partial)).toThrow(/verifyPassword/);
  });

  it("rejects a provider with no capabilities declaration", () => {
    const base = createNodeCryptoProvider();
    const noCaps = Object.assign(
      Object.create(Object.getPrototypeOf(base) as object),
      { ...base, capabilities: undefined },
    ) as unknown as CryptoProvider;
    expect(() => setDefaultCryptoProvider(noCaps)).toThrow(/capabilities/);
  });

  it("does not leave a broken provider installed", async () => {
    try {
      setDefaultCryptoProvider({} as unknown as CryptoProvider);
    } catch {
      /* expected */
    }
    await expect(randomHex(16)).resolves.toMatch(/^[0-9a-f]{16}$/);
  });

  it("still accepts the Node provider", async () => {
    setDefaultCryptoProvider(createNodeCryptoProvider());
    await expect(randomHex(16)).resolves.toMatch(/^[0-9a-f]{16}$/);
  });
});
