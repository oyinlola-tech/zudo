import { describe, it, expect } from "vitest";
import {
  randomBytesSecure,
  randomInteger,
  randomIntegerBelow,
  randomUuid,
  randomToken,
  randomHex,
  randomBase64,
  randomBase64Url,
  randomBoolean,
  randomChoice,
  fillRandomBytes,
} from "../src/cryptoRandom/index.js";

describe("randomBytesSecure", () => {
  it("generates requested number of bytes", async () => {
    const bytes = await randomBytesSecure(32);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(32);
  });

  it("generates different values on each call", async () => {
    const a = await randomBytesSecure(32);
    const b = await randomBytesSecure(32);
    expect(a).not.toEqual(b);
  });

  it("rejects non-positive lengths", async () => {
    await expect(randomBytesSecure(0)).rejects.toThrow();
    await expect(randomBytesSecure(-1)).rejects.toThrow();
  });
});

describe("randomInteger", () => {
  it("returns values in range", async () => {
    for (let i = 0; i < 100; i++) {
      const value = await randomInteger(0, 100);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(100);
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it("rejects invalid bounds", async () => {
    await expect(randomInteger(5, 5)).rejects.toThrow();
    await expect(randomInteger(10, 5)).rejects.toThrow();
  });
});

describe("randomIntegerBelow", () => {
  it("returns values below max", async () => {
    for (let i = 0; i < 100; i++) {
      const value = await randomIntegerBelow(10);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(10);
    }
  });
});

describe("randomUuid", () => {
  it("returns a valid UUID v4", async () => {
    const uuid = await randomUuid();
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("returns different UUIDs", async () => {
    const a = await randomUuid();
    const b = await randomUuid();
    expect(a).not.toBe(b);
  });
});

describe("randomToken", () => {
  it("returns a base64url token", async () => {
    const token = await randomToken();
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
  });
});

describe("randomHex", () => {
  it("returns hex string of requested length", async () => {
    const hex = await randomHex(16);
    expect(hex.length).toBe(16);
    expect(/^[0-9a-f]+$/.test(hex)).toBe(true);
  });
});

describe("randomBase64", () => {
  it("returns base64 string", async () => {
    const b64 = await randomBase64(16);
    expect(typeof b64).toBe("string");
    expect(b64.length).toBeGreaterThan(0);
  });
});

describe("randomBase64Url", () => {
  it("returns base64url string without padding", async () => {
    const b64url = await randomBase64Url(16);
    expect(typeof b64url).toBe("string");
    expect(b64url).not.toContain("+");
    expect(b64url).not.toContain("/");
    expect(b64url).not.toContain("=");
  });
});

describe("randomBoolean", () => {
  it("returns true or false", async () => {
    const results = new Set();
    for (let i = 0; i < 100; i++) {
      results.add(await randomBoolean());
    }
    expect(results.size).toBe(2);
  });
});

describe("randomChoice", () => {
  it("returns an element from the array", async () => {
    const values = ["a", "b", "c"];
    for (let i = 0; i < 50; i++) {
      const choice = await randomChoice(values);
      expect(values).toContain(choice);
    }
  });

  it("rejects empty array", async () => {
    await expect(randomChoice([])).rejects.toThrow();
  });
});

describe("fillRandomBytes", () => {
  it("fills the provided Uint8Array", async () => {
    // Pre-fill with a sentinel and assert the buffer changed, rather
    // than asserting no byte is zero: a zero byte is a legitimate
    // random result, and for 16 bytes P(at least one zero) is about
    // 6%, so the old assertion failed roughly one run in sixteen.
    const target = new Uint8Array(16).fill(0xab);
    const result = await fillRandomBytes(target);

    expect(result).toBe(target);
    expect(target.some((b) => b !== 0xab)).toBe(true);
  });

  it("rejects non-Uint8Array", async () => {
    await expect(
      fillRandomBytes(new ArrayBuffer(16) as unknown as Uint8Array),
    ).rejects.toThrow();
  });
});
