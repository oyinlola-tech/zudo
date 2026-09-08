import { describe, it, expect } from "vitest";
import { hash, hmac, hmacSha256, sha256, sha512 } from "../src/cryptoHash/index.js";
import { createNodeCryptoProvider } from "../src/node/index.js";

describe("hash algorithm allowlist", () => {
  it("rejects md5 and sha1 at the wrapper and provider", async () => {
    await expect(hash("hello", { algorithm: "md5" as never })).rejects.toThrow(
      TypeError,
    );
    const provider = createNodeCryptoProvider();
    await expect(provider.hash("sha1" as never, "x")).rejects.toThrow(TypeError);
    await expect(provider.hmac("md5" as never, "k", "x")).rejects.toThrow(
      TypeError,
    );
  });

  it("known answer: sha512('abc')", async () => {
    expect(await sha512("abc")).toBe(
      "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f",
    );
    expect(await sha256("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("HMAC", () => {
  it("matches RFC 4231 test case 1", async () => {
    const key = new Uint8Array(20).fill(0x0b);
    expect(await hmacSha256("Hi There", key)).toBe(
      "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7",
    );
    expect(await hmac("Hi There", key, "sha512")).toBe(
      "87aa7cdea5ef619d4ff0b4241a1d6cb02379f4e2ce4ec2787ad0b30545e17cdedaa833b7d6b8a702038b274eaea3f4e4be9d914eeb61f1702e696c203a126854",
    );
  });

  it("matches RFC 4231 test case 2 at the provider (short key)", async () => {
    const provider = createNodeCryptoProvider();
    const mac = await provider.hmac(
      "sha256",
      "Jefe",
      "what do ya want for nothing?",
    );
    expect(Buffer.from(mac).toString("hex")).toBe(
      "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    );
  });

  it("rejects empty and short keys", async () => {
    await expect(hmac("x", new Uint8Array(0))).rejects.toThrow();
    await expect(hmac("x", new Uint8Array(8))).rejects.toThrow(RangeError);
    const provider = createNodeCryptoProvider();
    await expect(provider.hmac("sha256", new Uint8Array(0), "x")).rejects.toThrow(
      TypeError,
    );
  });
});
