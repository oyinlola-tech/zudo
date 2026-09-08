import { describe, it, expect } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { sign, verify } from "../src/cryptoSignature/index.js";
import { createNodeCryptoProvider } from "../src/node/index.js";
import {
  toPrivateKey,
  toPublicKey,
  exportPrivateKeyPem,
  isKeyObject,
} from "../src/node/signing/index.js";
import { isCryptoError } from "@zudojs/errors";

const data = new Uint8Array([1, 2, 3, 4, 5]);

function rsaPair() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  return {
    priv: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    pub: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

function ecPair(curve: string) {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: curve,
  });
  return {
    priv: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    pub: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privDer: new Uint8Array(privateKey.export({ type: "pkcs8", format: "der" })),
    pubDer: new Uint8Array(publicKey.export({ type: "spki", format: "der" })),
  };
}

describe("every signature algorithm signs and verifies", () => {
  const rsa = rsaPair();
  for (const algorithm of ["rsa-sha256", "rsa-sha384", "rsa-sha512"] as const) {
    it(algorithm, async () => {
      const signature = await sign(data, rsa.priv, { algorithm });
      expect(await verify(data, signature, rsa.pub, { algorithm })).toBe(true);
      expect(
        await verify(new Uint8Array([9]), signature, rsa.pub, { algorithm }),
      ).toBe(false);
    });
  }

  const curves = {
    "ecdsa-sha256": "prime256v1",
    "ecdsa-sha384": "secp384r1",
    "ecdsa-sha512": "secp521r1",
  } as const;
  for (const [algorithm, curve] of Object.entries(curves) as [
    keyof typeof curves,
    string,
  ][]) {
    it(algorithm, async () => {
      const ec = ecPair(curve);
      const signature = await sign(data, ec.priv, { algorithm });
      expect(await verify(data, signature, ec.pub, { algorithm })).toBe(true);
      expect(
        await verify(new Uint8Array([9]), signature, ec.pub, { algorithm }),
      ).toBe(false);
    });
  }
});

describe("algorithm binds the key type", () => {
  it("refuses to sign with an EC key under rsa or ed25519 labels", async () => {
    const ec = ecPair("prime256v1");
    await expect(
      sign(data, ec.priv, { algorithm: "rsa-sha256" }),
    ).rejects.toSatisfy(isCryptoError);
    await expect(
      sign(data, ec.priv, { algorithm: "ed25519" }),
    ).rejects.toSatisfy(isCryptoError);
  });

  it("refuses to verify with a mismatching key type", async () => {
    const ec = ecPair("prime256v1");
    const signature = await sign(data, ec.priv, { algorithm: "ecdsa-sha256" });
    await expect(
      verify(data, signature, ec.pub, { algorithm: "rsa-sha256" }),
    ).rejects.toSatisfy(isCryptoError);
  });

  it("rejects unsupported algorithm names at runtime", async () => {
    const ec = ecPair("prime256v1");
    await expect(
      sign(data, ec.priv, { algorithm: "md5" as never }),
    ).rejects.toSatisfy(isCryptoError);
  });
});

describe("key material handling", () => {
  it("verify returns false for malformed keys and signatures", async () => {
    const ec = ecPair("prime256v1");
    const signature = await sign(data, ec.priv, { algorithm: "ecdsa-sha256" });
    expect(
      await verify(data, signature, "not a key", { algorithm: "ecdsa-sha256" }),
    ).toBe(false);
    expect(
      await verify(data, new Uint8Array([1, 2, 3]), ec.pub, {
        algorithm: "ecdsa-sha256",
      }),
    ).toBe(false);
  });

  it("sign throws CryptoError for malformed private keys", async () => {
    await expect(
      sign(data, "garbage", { algorithm: "ecdsa-sha256" }),
    ).rejects.toSatisfy(isCryptoError);
  });

  it("accepts DER bytes and PEM bytes through the provider", async () => {
    const ec = ecPair("prime256v1");
    const provider = createNodeCryptoProvider();
    const signature = await provider.sign({
      key: ec.privDer,
      data,
      algorithm: "ecdsa-sha256",
    });
    expect(
      await provider.verify({
        key: ec.pubDer,
        data,
        signature,
        algorithm: "ecdsa-sha256",
      }),
    ).toBe(true);
    expect(
      await provider.verify({
        key: new Uint8Array(Buffer.from(ec.pub, "utf8")),
        data,
        signature,
        algorithm: "ecdsa-sha256",
      }),
    ).toBe(true);
  });

  it("toPrivateKey/toPublicKey sniff PEM bytes", () => {
    const ec = ecPair("prime256v1");
    expect(isKeyObject(toPrivateKey(Buffer.from(ec.priv, "utf8")))).toBe(true);
    expect(isKeyObject(toPublicKey(Buffer.from(ec.pub, "utf8")))).toBe(true);
    expect(isKeyObject(toPrivateKey(ec.privDer))).toBe(true);
    expect(isKeyObject({ type: 1, export: 1 })).toBe(false);
    expect(exportPrivateKeyPem(toPrivateKey(ec.priv))).toContain("-----BEGIN");
  });
});
