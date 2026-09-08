import { describe, it, expect } from "vitest";
import {
  toHex,
  fromHex,
  toBase64,
  fromBase64,
  toBase64Url,
  fromBase64Url,
  isHex,
  isBase64,
  isBase64Url,
} from "../src/cryptoEncoding/index.js";

describe("hex encoding", () => {
  it("encodes bytes to hex", () => {
    expect(toHex(new Uint8Array([0, 255, 16]))).toBe("00ff10");
  });

  it("decodes hex to bytes", () => {
    expect(fromHex("00ff10")).toEqual(new Uint8Array([0, 255, 16]));
  });

  it("round-trips hex", () => {
    const original = new Uint8Array([10, 20, 30, 40, 50]);
    expect(fromHex(toHex(original))).toEqual(original);
  });

  it("rejects invalid hex", () => {
    expect(isHex("xyz")).toBe(false);
    expect(isHex("abc")).toBe(false);
    expect(isHex("")).toBe(true);
    expect(fromHex("")).toEqual(new Uint8Array());
  });

  it("accepts valid hex", () => {
    expect(isHex("00ff10")).toBe(true);
    expect(isHex("AbC")).toBe(false);
    expect(isHex("aBc123")).toBe(true);
  });
});

describe("base64 encoding", () => {
  it("encodes bytes to base64", () => {
    expect(toBase64(new Uint8Array([72, 101, 108, 108, 111]))).toBe("SGVsbG8=");
  });

  it("decodes base64 to bytes", () => {
    expect(fromBase64("SGVsbG8=")).toEqual(
      new Uint8Array([72, 101, 108, 108, 111]),
    );
  });

  it("round-trips base64", () => {
    const original = new Uint8Array([1, 2, 3, 4, 5]);
    expect(fromBase64(toBase64(original))).toEqual(original);
  });

  it("rejects invalid base64", () => {
    expect(isBase64("xyz!")).toBe(false);
    expect(isBase64("abc")).toBe(false);
  });
});

describe("base64url encoding", () => {
  it("encodes bytes to base64url", () => {
    expect(toBase64Url(new Uint8Array([255, 254, 253]))).toBe("__79");
  });

  it("decodes base64url to bytes", () => {
    expect(fromBase64Url("__79")).toEqual(new Uint8Array([255, 254, 253]));
  });

  it("round-trips base64url", () => {
    const original = new Uint8Array([1, 2, 3, 4, 5]);
    expect(fromBase64Url(toBase64Url(original))).toEqual(original);
  });

  it("rejects invalid base64url", () => {
    expect(isBase64Url("xyz+")).toBe(false);
    expect(isBase64Url("abc")).toBe(true);
  });
});
