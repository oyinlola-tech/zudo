import { describe, it, expect } from "vitest";
import { createCryptoService } from "../src/cryptoService/index.js";
import { CryptoAlgorithm } from "../src/cryptoConstants/index.js";

describe("CryptoService", () => {
  const service = createCryptoService();

  describe("randomBytes", () => {
    it("generates bytes", async () => {
      const bytes = await service.randomBytes(16);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(16);
    });
  });

  describe("generateKey", () => {
    it("generates a crypto key", async () => {
      const key = await service.generateKey();
      expect(key.algorithm).toBe("aes-256-gcm");
      expect(key.length).toBe(256);
    });
  });

  describe("hash", () => {
    it("hashes data", async () => {
      const digest = await service.hash("hello");
      expect(digest).toBeInstanceOf(Uint8Array);
      expect(digest.length).toBe(32);
    });

    it("returns hex string", async () => {
      const hex = await service.hashHex("hello");
      expect(typeof hex).toBe("string");
      expect(hex).toBe(
        "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
      );
    });
  });

  describe("encrypt / decrypt", () => {
    it("round-trips data", async () => {
      const key = await service.generateKey();
      const plaintext = new Uint8Array([1, 2, 3, 4, 5]);
      const encrypted = await service.encrypt(plaintext, key.bytes());
      const decrypted = await service.decrypt(
        encrypted.ciphertext,
        key.bytes(),
        encrypted.iv,
        encrypted.authTag,
      );
      expect(decrypted).toEqual(plaintext);
    });
  });

  describe("hashPassword / verifyPassword", () => {
    it("hashes and verifies password", async () => {
      const hash = await service.hashPassword("test-password");
      const valid = await service.verifyPassword("test-password", hash.encoded);
      expect(valid).toBe(true);
    });

    it("rejects wrong password", async () => {
      const hash = await service.hashPassword("test-password");
      const valid = await service.verifyPassword("wrong", hash.encoded);
      expect(valid).toBe(false);
    });
  });

  describe("deriveKey", () => {
    it("derives a key", async () => {
      const result = await service.deriveKey("password", CryptoAlgorithm.SCRYPT, {
        salt: new Uint8Array(16).fill(1),
      });
      expect(result.key).toBeInstanceOf(Uint8Array);
    });
  });

  describe("generateToken / hashToken / verifyToken", () => {
    it("generates a token", async () => {
      const token = await service.generateToken();
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(0);
    });

    it("hashes and verifies token", async () => {
      const token = "my-secret-token";
      const hash = await service.hashToken(token);
      expect(await service.verifyToken(token, hash)).toBe(true);
      expect(await service.verifyToken("wrong", hash)).toBe(false);
    });
  });

  describe("encode / decode", () => {
    it("round-trips base64url", async () => {
      const original = new Uint8Array([1, 2, 3]);
      const encoded = service.encode(original);
      const decoded = service.decode(encoded);
      expect(decoded).toEqual(original);
    });
  });
});
