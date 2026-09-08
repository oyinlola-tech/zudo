import { describe, it, expect } from "vitest";
import { createNodeCryptoProvider } from "../src/node/index.js";

describe("NodeCryptoProvider", () => {
  const provider = createNodeCryptoProvider();

  describe("randomBytes", () => {
    it("generates requested bytes", async () => {
      const bytes = await provider.randomBytes(16);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(16);
    });

    it("rejects invalid length", async () => {
      await expect(provider.randomBytes(0)).rejects.toThrow();
      await expect(provider.randomBytes(-1)).rejects.toThrow();
    });
  });

  describe("randomInt", () => {
    it("returns values in range", async () => {
      for (let i = 0; i < 100; i++) {
        const value = await provider.randomInt(0, 100);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(100);
      }
    });

    it("rejects invalid bounds", async () => {
      await expect(provider.randomInt(5, 5)).rejects.toThrow();
      await expect(provider.randomInt(10, 5)).rejects.toThrow();
    });
  });

  describe("randomUUID", () => {
    it("returns a valid UUID", async () => {
      const uuid = await provider.randomUUID();
      expect(uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    });
  });

  describe("hash", () => {
    it("hashes data with sha256", async () => {
      const digest = await provider.hash("sha256", new Uint8Array([1, 2, 3]));
      expect(digest).toBeInstanceOf(Uint8Array);
      expect(digest.length).toBe(32);
    });

    it("hashes data with sha512", async () => {
      const digest = await provider.hash("sha512", new Uint8Array([1, 2, 3]));
      expect(digest.length).toBe(64);
    });
  });

  describe("hmac", () => {
    it("computes HMAC", async () => {
      const key = new Uint8Array(16).fill(1);
      const data = new Uint8Array([1, 2, 3]);
      const mac = await provider.hmac("sha256", key, data);
      expect(mac).toBeInstanceOf(Uint8Array);
      expect(mac.length).toBe(32);
    });
  });

  describe("encrypt / decrypt", () => {
    it("round-trips plaintext", async () => {
      const key = new Uint8Array(32).fill(42);
      const plaintext = new Uint8Array([1, 2, 3, 4, 5]);
      const encrypted = await provider.encrypt({ key, plaintext });
      expect(encrypted.algorithm).toBe("aes-256-gcm");
      expect(encrypted.ciphertext.length).toBe(5);
      expect(encrypted.nonce.length).toBe(12);
      expect(encrypted.tag.length).toBe(16);

      const decrypted = await provider.decrypt({ key, encrypted });
      expect(decrypted).toEqual(plaintext);
    });

    it("includes AAD in encryption", async () => {
      const key = new Uint8Array(32).fill(42);
      const plaintext = new Uint8Array([1, 2, 3]);
      const aad = new Uint8Array([9, 9, 9]);
      const encrypted = await provider.encrypt({
        key,
        plaintext,
        associatedData: aad,
      });
      const decrypted = await provider.decrypt({
        key,
        encrypted,
        associatedData: aad,
      });
      expect(decrypted).toEqual(plaintext);
    });

    it("fails decryption with wrong AAD", async () => {
      const key = new Uint8Array(32).fill(42);
      const plaintext = new Uint8Array([1, 2, 3]);
      const encrypted = await provider.encrypt({
        key,
        plaintext,
        associatedData: new Uint8Array([1]),
      });
      await expect(
        provider.decrypt({
          key,
          encrypted,
          associatedData: new Uint8Array([2]),
        }),
      ).rejects.toThrow();
    });
  });

  describe("sign / verify", () => {
    it("signs and verifies data", async () => {
      const { privateKey, publicKey } =
        await import("../src/node/signing/index.js").then((m) =>
          m.generateEd25519KeyPair(),
        );
      const privatePem = await import("../src/node/signing/index.js").then(
        (m) => m.exportPrivateKeyPem(privateKey),
      );
      const publicPem = await import("../src/node/signing/index.js").then((m) =>
        m.exportPublicKeyPem(publicKey),
      );
      const data = new Uint8Array([1, 2, 3]);
      const signature = await provider.sign({ key: privatePem, data });
      const valid = await provider.verify({ key: publicPem, data, signature });
      expect(valid).toBe(true);
    });

    it("rejects tampered data", async () => {
      const { privateKey, publicKey } =
        await import("../src/node/signing/index.js").then((m) =>
          m.generateEd25519KeyPair(),
        );
      const privatePem = await import("../src/node/signing/index.js").then(
        (m) => m.exportPrivateKeyPem(privateKey),
      );
      const publicPem = await import("../src/node/signing/index.js").then((m) =>
        m.exportPublicKeyPem(publicKey),
      );
      const data = new Uint8Array([1, 2, 3]);
      const signature = await provider.sign({ key: privatePem, data });
      const valid = await provider.verify({
        key: publicPem,
        data: new Uint8Array([1, 2, 4]),
        signature,
      });
      expect(valid).toBe(false);
    });
  });

  describe("deriveKey", () => {
    it("derives key with PBKDF2", async () => {
      const key = await provider.deriveKey({
        password: "password",
        salt: new Uint8Array(16),
        algorithm: "pbkdf2",
        keyLength: 32,
        iterations: 100_000,
      });
      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBe(32);
    });

    it("derives key with scrypt", async () => {
      const key = await provider.deriveKey({
        password: "password",
        salt: new Uint8Array(16),
        algorithm: "scrypt",
        keyLength: 32,
      });
      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBe(32);
    });

    it("throws for unsupported algorithms such as argon2id", async () => {
      await expect(
        provider.deriveKey({
          password: "password",
          salt: new Uint8Array(16),
          algorithm: "argon2id" as never,
        }),
      ).rejects.toThrow();
    });
  });

  describe("hashPassword / verifyPassword", () => {
    it("hashes and verifies a password", async () => {
      const hash = await provider.hashPassword("secure-password");
      expect(typeof hash).toBe("string");
      expect(hash).toMatch(/^v1\$scrypt\$/);
      const valid = await provider.verifyPassword("secure-password", hash);
      expect(valid).toBe(true);
    });

    it("rejects wrong password", async () => {
      const hash = await provider.hashPassword("secure-password");
      const valid = await provider.verifyPassword("wrong-password", hash);
      expect(valid).toBe(false);
    });
  });
});

describe("NodeCryptoProvider capabilities", () => {
  it("reports all capabilities", () => {
    const provider = createNodeCryptoProvider();
    expect(provider.capabilities.hash).toBe(true);
    expect(provider.capabilities.hmac).toBe(true);
    expect(provider.capabilities.encryption).toBe(true);
    expect(provider.capabilities.signing).toBe(true);
    expect(provider.capabilities.random).toBe(true);
    expect(provider.capabilities.passwordHashing).toBe(true);
    expect(provider.capabilities.keyDerivation).toBe(true);
  });

  it("has name 'node'", () => {
    const provider = createNodeCryptoProvider();
    expect(provider.name).toBe("node");
  });
});
