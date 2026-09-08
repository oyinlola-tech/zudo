import { describe, it, expect } from "vitest";
import {
  encode,
  decode,
  utf8Decode,
  fromBase64Url,
  isBase64Url,
  fromBase64,
  isBase64,
  toHex,
  toBase64,
  timingSafeEqualEncoded,
  arrayBufferToBytes,
  bytesToArrayBuffer,
} from "../src/cryptoEncoding/index.js";
import {
  bytesToHex,
  hexToBytes,
  base64UrlToBytes,
  bytesToBase64Url,
  isHexString,
  isBase64UrlString,
  numberToBytes,
  bytesToNumber,
} from "../src/cryptoUtils/index.js";
import { timingSafeEqual } from "../src/compare/index.js";
import { generateToken } from "../src/cryptoToken/index.js";
import { verifyTokenHash, hashToken } from "../src/cryptoToken/index.js";

describe("utf8 encoding is strict", () => {
  it("throws for invalid UTF-8 instead of producing U+FFFD", () => {
    expect(() => encode(new Uint8Array([0xff, 0xfe, 1]), "utf8")).toThrow(
      TypeError,
    );
    expect(() => utf8Decode(new Uint8Array([0xc3]))).toThrow(TypeError);
  });

  it("round-trips valid text", () => {
    const bytes = decode("héllo", "utf8");
    expect(encode(bytes, "utf8")).toBe("héllo");
  });
});

describe("base64url canonical form", () => {
  it("rejects non-canonical trailing bits and bad lengths", () => {
    expect(isBase64Url("Zg")).toBe(true);
    expect(isBase64Url("Zh")).toBe(false);
    expect(() => fromBase64Url("Zh")).toThrow(TypeError);
    expect(isBase64Url("abcde")).toBe(false);
    expect(() => fromBase64Url("abcde")).toThrow(TypeError);
    expect(isBase64Url("")).toBe(true);
    expect(fromBase64Url("")).toEqual(new Uint8Array());
  });

  it("timingSafeEqualEncoded does not equate malleable encodings", () => {
    expect(timingSafeEqualEncoded("Zh", "Zg")).toBe(false);
    expect(timingSafeEqualEncoded("Zg", "Zg")).toBe(true);
    expect(timingSafeEqualEncoded("!!", "Zg")).toBe(false);
  });

  it("base64 also rejects non-canonical input", () => {
    expect(isBase64("Zh==")).toBe(false);
    expect(() => fromBase64("Zh==")).toThrow(TypeError);
    expect(isBase64("")).toBe(true);
  });
});

describe("utility aliases agree with the encoding module", () => {
  it("hex/base64url helpers share semantics", () => {
    expect(bytesToHex(new Uint8Array([255]))).toBe(toHex(new Uint8Array([255])));
    expect(hexToBytes("")).toEqual(new Uint8Array());
    expect(isHexString("")).toBe(true);
    expect(isBase64UrlString("abcde")).toBe(false);
    expect(() => base64UrlToBytes("Zh")).toThrow(TypeError);
    expect(bytesToBase64Url(new Uint8Array([255, 254]))).toBe("__4");
  });

  it("encodes large buffers quickly", () => {
    const big = new Uint8Array(4 * 1024 * 1024);
    const start = performance.now();
    toHex(big);
    toBase64(big);
    expect(performance.now() - start).toBeLessThan(500);
  });

  it("arrayBuffer helpers copy", () => {
    const ab = bytesToArrayBuffer(new Uint8Array([1, 2]));
    expect(arrayBufferToBytes(ab)).toEqual(new Uint8Array([1, 2]));
  });
});

describe("numberToBytes", () => {
  it("works with the default byte length", () => {
    expect(numberToBytes(5)).toEqual(new Uint8Array([0, 0, 0, 0, 0, 5]));
    expect(bytesToNumber(numberToBytes(2 ** 40 + 3))).toBe(2 ** 40 + 3);
    expect(() => numberToBytes(5, 8)).toThrow(RangeError);
  });
});

describe("timingSafeEqual", () => {
  it("rejects non-byte inputs", () => {
    expect(() => timingSafeEqual([1] as never, [1] as never)).toThrow(TypeError);
  });
});

describe("token encoding allowlist", () => {
  it("rejects utf8 tokens", async () => {
    await expect(generateToken({ encoding: "utf8" as never })).rejects.toThrow(
      TypeError,
    );
  });

  it("verifyTokenHash is case-insensitive on hex", async () => {
    const stored = await hashToken("tok");
    expect(await verifyTokenHash("tok", stored.toUpperCase())).toBe(true);
    expect(await verifyTokenHash("tok", "zz")).toBe(false);
  });
});
