import { describe, it, expect } from "vitest";

// Mirrors the README "Quick Start" verbatim so that the documented example
// is typechecked (tsconfig.test.json) and executed against the real exports.
import {
  randomBytesSecure,
  hash,
  hashPassword,
  verifyPassword,
  encryptEnvelope,
  decryptEnvelope,
  generateToken,
} from "../src/index.js";

describe("README quick start", () => {
  it("compiles and runs against the public exports", async () => {
    const digest = await hash("hello", { algorithm: "sha256", encoding: "hex" });
    expect(digest.encoded).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );

    const stored = await hashPassword("correct horse battery staple");
    const ok = await verifyPassword("correct horse battery staple", stored.encoded);
    expect(ok).toBe(true);
    expect(stored.encoded.startsWith("v1$scrypt$")).toBe(true);

    const key = await randomBytesSecure(32);
    const envelope = await encryptEnvelope(new TextEncoder().encode("secret"), key);
    const plaintext = await decryptEnvelope(envelope, key);
    expect(new TextDecoder().decode(plaintext)).toBe("secret");

    const sessionToken = await generateToken({ bytes: 32, prefix: "sess_" });
    expect(sessionToken.startsWith("sess_")).toBe(true);
    expect(sessionToken.length).toBeGreaterThan("sess_".length + 40);
  });
});
