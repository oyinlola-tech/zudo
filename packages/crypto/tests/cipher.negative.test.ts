import { describe, it, expect } from "vitest";
import {
  encrypt,
  decrypt,
  encryptEnvelope,
  decryptEnvelope,
} from "../src/cryptoCipher/index.js";
import { createNodeCryptoProvider } from "../src/node/index.js";
import { isCryptoError, CryptoOperation } from "@zudojs/errors";

const KEY = new Uint8Array(32).fill(7);

describe("AES-GCM hardening", () => {
  it("rejects truncated authentication tags at every layer", async () => {
    const encrypted = await encrypt(new Uint8Array([1, 2, 3]), KEY);
    const shortTag = encrypted.authTag.slice(0, 4);

    await expect(
      decrypt(encrypted.ciphertext, KEY, encrypted.iv, shortTag),
    ).rejects.toSatisfy(
      (e: unknown) =>
        isCryptoError(e) && e.operation === CryptoOperation.DECRYPT,
    );

    const provider = createNodeCryptoProvider();
    await expect(
      provider.decrypt({
        key: KEY,
        encrypted: { ...encrypted, algorithm: "aes-256-gcm", nonce: encrypted.iv, tag: shortTag },
      }),
    ).rejects.toSatisfy(isCryptoError);

    const envelope = await encryptEnvelope(new Uint8Array([1, 2, 3]), KEY);
    const parts = envelope.split(".");
    parts[3] = Buffer.from(shortTag).toString("base64url");
    await expect(decryptEnvelope(parts.join("."), KEY)).rejects.toSatisfy(
      isCryptoError,
    );
  });

  it("rejects tampered ciphertext and tags", async () => {
    const encrypted = await encrypt(new Uint8Array([1, 2, 3, 4]), KEY);
    const badCiphertext = new Uint8Array(encrypted.ciphertext);
    badCiphertext[0] = badCiphertext[0]! ^ 0x01;
    await expect(
      decrypt(badCiphertext, KEY, encrypted.iv, encrypted.authTag),
    ).rejects.toSatisfy(isCryptoError);

    const badTag = new Uint8Array(encrypted.authTag);
    badTag[15] = badTag[15]! ^ 0x01;
    await expect(
      decrypt(encrypted.ciphertext, KEY, encrypted.iv, badTag),
    ).rejects.toSatisfy(isCryptoError);
  });

  it("rejects IVs that are not 12 bytes", async () => {
    await expect(
      encrypt(new Uint8Array([1]), KEY, { iv: new Uint8Array(1) }),
    ).rejects.toSatisfy(isCryptoError);
    await expect(
      encrypt(new Uint8Array([1]), KEY, { iv: new Uint8Array(16) }),
    ).rejects.toSatisfy(isCryptoError);

    const encrypted = await encrypt(new Uint8Array([1]), KEY);
    await expect(
      decrypt(encrypted.ciphertext, KEY, new Uint8Array(8), encrypted.authTag),
    ).rejects.toSatisfy(isCryptoError);
  });

  it("rejects wrong key lengths with a CryptoError carrying cause-free diagnostics", async () => {
    await expect(
      encrypt(new Uint8Array([1]), new Uint8Array(16)),
    ).rejects.toSatisfy(
      (e: unknown) =>
        isCryptoError(e) && e.message.includes("32 bytes"),
    );
  });

  it("rejects non-aes-256-gcm algorithm labels at the provider", async () => {
    const provider = createNodeCryptoProvider();
    const encrypted = await provider.encrypt({ key: KEY, plaintext: "x" });
    await expect(
      provider.decrypt({
        key: KEY,
        encrypted: { ...encrypted, algorithm: "chacha20-poly1305" as never },
      }),
    ).rejects.toSatisfy(isCryptoError);
  });

  it("surfaces authentication failure as CryptoError with cause", async () => {
    const encrypted = await encrypt(new Uint8Array([1]), KEY);
    const wrongKey = new Uint8Array(32).fill(9);
    let caught: unknown;
    try {
      await decrypt(encrypted.ciphertext, wrongKey, encrypted.iv, encrypted.authTag);
    } catch (error) {
      caught = error;
    }
    expect(isCryptoError(caught)).toBe(true);
    expect((caught as { cause?: unknown }).cause).toBeInstanceOf(Error);
  });

  it("rejects envelopes with non-canonical base64url fields", async () => {
    const envelope = await encryptEnvelope(new Uint8Array([1, 2, 3]), KEY);
    await expect(decryptEnvelope(envelope + "!", KEY)).rejects.toSatisfy(
      isCryptoError,
    );
    await expect(
      decryptEnvelope("v1.aes-256-gcm..abc.def", KEY),
    ).rejects.toSatisfy(isCryptoError);
  });

  it("honours an explicit 12-byte IV", async () => {
    const iv = new Uint8Array(12).fill(3);
    const a = await encrypt(new Uint8Array([1]), KEY, { iv });
    expect(a.iv).toEqual(iv);
    expect(await decrypt(a.ciphertext, KEY, a.iv, a.authTag)).toEqual(
      new Uint8Array([1]),
    );
  });
});
