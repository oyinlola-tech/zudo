import { describe, it, expect } from "vitest";
import {
  sign,
  verify,
  signString,
  verifyString,
} from "../src/cryptoSignature/index.js";
import {
  generateEd25519KeyPair,
  exportPrivateKeyPem,
  exportPublicKeyPem,
} from "../src/node/signing/index.js";

describe("sign / verify", () => {
  it("signs and verifies data", async () => {
    const { privateKey, publicKey } = generateEd25519KeyPair();
    const privatePem = exportPrivateKeyPem(privateKey);
    const publicPem = exportPublicKeyPem(publicKey);
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const signature = await sign(data, privatePem);
    expect(signature).toBeInstanceOf(Uint8Array);
    expect(signature.length).toBeGreaterThan(0);
    const valid = await verify(data, signature, publicPem);
    expect(valid).toBe(true);
  });

  it("rejects tampered data", async () => {
    const { privateKey, publicKey } = generateEd25519KeyPair();
    const privatePem = exportPrivateKeyPem(privateKey);
    const publicPem = exportPublicKeyPem(publicKey);
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const signature = await sign(data, privatePem);
    const tampered = new Uint8Array([1, 2, 3, 4, 6]);
    const valid = await verify(tampered, signature, publicPem);
    expect(valid).toBe(false);
  });

  it("rejects signature with wrong key", async () => {
    const { privateKey: pk1 } = generateEd25519KeyPair();
    const { publicKey: pub2 } = generateEd25519KeyPair();
    const privatePem = exportPrivateKeyPem(pk1);
    const pub2Pem = exportPublicKeyPem(pub2);
    const data = new Uint8Array([1, 2, 3]);
    const signature = await sign(data, privatePem);
    const valid = await verify(data, signature, pub2Pem);
    expect(valid).toBe(false);
  });

  it("signs and verifies strings", async () => {
    const { privateKey, publicKey } = generateEd25519KeyPair();
    const privatePem = exportPrivateKeyPem(privateKey);
    const publicPem = exportPublicKeyPem(publicKey);
    const signature = await signString("hello", privatePem);
    const valid = await verifyString("hello", signature, publicPem);
    expect(valid).toBe(true);
  });

  it("rejects tampered string", async () => {
    const { privateKey, publicKey } = generateEd25519KeyPair();
    const privatePem = exportPrivateKeyPem(privateKey);
    const publicPem = exportPublicKeyPem(publicKey);
    const signature = await signString("hello", privatePem);
    const valid = await verifyString("world", signature, publicPem);
    expect(valid).toBe(false);
  });
});

describe("key generation and export", () => {
  it("generates Ed25519 key pair", () => {
    const { privateKey, publicKey } = generateEd25519KeyPair();
    expect(privateKey).toBeDefined();
    expect(publicKey).toBeDefined();
  });

  it("exports keys as PEM", () => {
    const { privateKey, publicKey } = generateEd25519KeyPair();
    const privatePem = exportPrivateKeyPem(privateKey);
    const publicPem = exportPublicKeyPem(publicKey);
    expect(privatePem).toContain("-----BEGIN");
    expect(privatePem).toContain("PRIVATE KEY-----");
    expect(publicPem).toContain("-----BEGIN");
    expect(publicPem).toContain("PUBLIC KEY-----");
  });
});
