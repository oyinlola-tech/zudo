import { describe, it, expect } from "vitest";
import {
  randomInteger,
  randomIntegerBelow,
  randomChoice,
  randomFromAlphabet,
  randomNumericCode,
  randomAlphanumeric,
} from "../src/cryptoRandom/index.js";
import { createNodeCryptoProvider } from "../src/node/index.js";

describe("randomInt edge ranges", () => {
  it("returns the only value for single-value ranges", async () => {
    expect(await randomInteger(0, 1)).toBe(0);
    expect(await randomInteger(5, 6)).toBe(5);
    expect(await randomIntegerBelow(1)).toBe(0);
    expect(await randomChoice(["only"])).toBe("only");
    expect(await randomFromAlphabet(4, "a")).toBe("aaaa");
  });

  it("covers values above 2^32 in large ranges", async () => {
    const provider = createNodeCryptoProvider();
    let max = 0;
    for (let i = 0; i < 200; i += 1) {
      max = Math.max(max, await provider.randomInt(0, 2 ** 40));
    }
    expect(max).toBeGreaterThan(2 ** 32);
  });

  it("can produce 2^32 for range 2^32 + 1", async () => {
    // Probabilistic sanity check: values >= 2^32 are reachable at all.
    const provider = createNodeCryptoProvider();
    let seenHigh = false;
    for (let i = 0; i < 300 && !seenHigh; i += 1) {
      seenHigh = (await provider.randomInt(2 ** 32 - 1, 2 ** 32 + 2 ** 20)) >= 2 ** 32;
    }
    expect(seenHigh).toBe(true);
  });

  it("rejects ranges above 2^48 and non-safe integers", async () => {
    await expect(randomInteger(0, 2 ** 49)).rejects.toThrow(RangeError);
    await expect(randomInteger(0, Number.MAX_SAFE_INTEGER + 2)).rejects.toThrow(
      TypeError,
    );
    await expect(randomInteger(1.5, 3)).rejects.toThrow(TypeError);
  });

  it("supports negative bounds", async () => {
    for (let i = 0; i < 50; i += 1) {
      const v = await randomInteger(-10, -5);
      expect(v).toBeGreaterThanOrEqual(-10);
      expect(v).toBeLessThan(-5);
    }
  });
});

describe("random string helpers", () => {
  it("counts code points for astral alphabets", async () => {
    const value = await randomFromAlphabet(3, "😀😁");
    expect(Array.from(value).length).toBe(3);
    expect(value.length).toBe(6);
  });

  it("validates lengths", async () => {
    await expect(randomNumericCode(2.5)).rejects.toThrow(RangeError);
    await expect(randomNumericCode(0)).rejects.toThrow(RangeError);
    await expect(randomAlphanumeric(-1)).rejects.toThrow(RangeError);
    await expect(randomFromAlphabet(0, "abc")).rejects.toThrow(RangeError);
  });

  it("produces numeric codes of the requested length with digits only", async () => {
    const code = await randomNumericCode(9);
    expect(code).toMatch(/^\d{9}$/);
  });
});
