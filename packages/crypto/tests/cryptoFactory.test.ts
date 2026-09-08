import { describe, it, expect } from "vitest";
import { createCryptoFactory } from "../src/cryptoFactory/index.js";

describe("CryptoFactory", () => {
  const factory = createCryptoFactory();

  describe("createKey", () => {
    it("creates a crypto key", async () => {
      const key = await factory.createKey();
      expect(key.algorithm).toBe("aes-256-gcm");
      expect(key.length).toBe(256);
    });
  });

  describe("createToken", () => {
    it("creates a token", async () => {
      const token = await factory.createToken();
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(0);
    });

    it("creates token with prefix", async () => {
      const token = await factory.createToken(32, "lat_");
      expect(token.startsWith("lat_")).toBe(true);
    });
  });

  describe("token factories", () => {
    it("creates API key", async () => {
      expect(await factory.createApiKey()).toMatch(/^lat_/);
    });

    it("creates session token", async () => {
      expect(await factory.createSessionToken()).toMatch(/^sess_/);
    });

    it("creates refresh token", async () => {
      expect(await factory.createRefreshToken()).toMatch(/^ref_/);
    });

    it("creates verification token", async () => {
      expect(await factory.createVerificationToken()).toMatch(/^verify_/);
    });

    it("creates password reset token", async () => {
      expect(await factory.createPasswordResetToken()).toMatch(/^reset_/);
    });

    it("creates CSRF token", async () => {
      expect(await factory.createCsrfToken()).toMatch(/^csrf_/);
    });

    it("creates OTP", async () => {
      const otp = await factory.createOtp();
      expect(otp.length).toBe(6);
    });
  });

  describe("password", () => {
    it("creates and verifies password hash", async () => {
      const hash = await factory.createPasswordHash("test-password");
      expect(hash.encoded).toMatch(/^v1\$scrypt\$/);
      expect(await factory.verifyPassword("test-password", hash.encoded)).toBe(
        true,
      );
      expect(await factory.verifyPassword("wrong", hash.encoded)).toBe(false);
    });
  });

  describe("encode / decode", () => {
    it("round-trips data", async () => {
      const original = new Uint8Array([1, 2, 3]);
      const encoded = factory.encode(original);
      const decoded = factory.decode(encoded);
      expect(decoded).toEqual(original);
    });
  });

  describe("getOptions", () => {
    it("returns factory configuration", () => {
      const options = factory.getOptions();
      expect(options.defaultKeyAlgorithm).toBe("aes-256-gcm");
      expect(options.encoding).toBe("base64url");
    });
  });
});
