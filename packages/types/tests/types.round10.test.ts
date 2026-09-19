import { describe, expect, it } from "vitest";

import {
  MAX_RANDOM_INT_BOUND,
  SeededRandom,
  camelToKebab,
  camelToSnake,
  isEmail,
  safeJsonParse,
  systemRandom,
} from "../src/index.js";

describe("LEAF-01", () => {
  it("draws bounds above 2**32 without hanging", () => {
    for (const max of [2 ** 32 + 1, 2 ** 40 + 7, 2 ** 52 + 3]) {
      for (let i = 0; i < 50; i++) {
        const value = systemRandom.int(max);
        expect(Number.isSafeInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(max);
      }
    }
    expect(systemRandom.int(MAX_RANDOM_INT_BOUND)).toBeLessThan(
      MAX_RANDOM_INT_BOUND,
    );
  });

  it("uses the high bits for bounds above 2**32", () => {
    const max = 2 ** 50;
    const seen = Array.from({ length: 40 }, () => systemRandom.int(max));
    expect(seen.some((value) => value >= 2 ** 32)).toBe(true);
  });

  it("rejects unsafe or non-integer bounds with a RangeError", () => {
    for (const max of [2 ** 53, Number.MAX_VALUE, Infinity, NaN, 0, -1, 1.5]) {
      expect(() => systemRandom.int(max)).toThrow(RangeError);
      expect(() => new SeededRandom(1).int(max)).toThrow(RangeError);
    }
  });

  it("keeps 2**32 itself working", () => {
    expect(systemRandom.int(2 ** 32)).toBeLessThan(2 ** 32);
  });
});

describe("LEAF-07", () => {
  it("produces distinct UUIDs well past 16 draws", () => {
    const random = new SeededRandom(42);
    const ids = new Set(Array.from({ length: 10_000 }, () => random.uuid()));
    expect(ids.size).toBe(10_000);
  });

  it("keeps UUIDs structurally v4 and reproducible", () => {
    const a = new SeededRandom(7).uuid();
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(new SeededRandom(7).uuid()).toBe(a);
  });

  it("int(2) does not simply alternate", () => {
    const random = new SeededRandom(42);
    const bits = Array.from({ length: 64 }, () => random.int(2)).join("");
    expect(bits).not.toMatch(/^(01)+$|^(10)+$/);
    expect(bits).toContain("00");
    expect(bits).toContain("11");
  });

  it("supports bounds above 2**32 deterministically", () => {
    const max = 2 ** 45 + 1;
    expect(new SeededRandom(3).int(max)).toBe(new SeededRandom(3).int(max));
  });
});

describe("LEAF-15", () => {
  it("keeps non-ASCII letters", () => {
    expect(camelToSnake("caféAuLait")).toBe("café_au_lait");
    expect(camelToSnake("naïveValue")).toBe("naïve_value");
    expect(camelToKebab("ÉtatCivil")).toBe("état-civil");
  });

  it("passes through punctuation instead of deleting it", () => {
    expect(camelToKebab("user.name")).toBe("user.name");
    expect(camelToSnake("price$Total")).toBe("price$total");
  });

  it("keeps the ASCII behaviour", () => {
    expect(camelToSnake("parseHTTPResponse")).toBe("parse_http_response");
    expect(camelToSnake("HelloWorld")).toBe("hello_world");
    expect(camelToSnake("already_snake")).toBe("already_snake");
    expect(camelToKebab("userId2Fa")).toBe("user-id2-fa");
  });
});

describe("LEAF-17", () => {
  it("drops constructor/prototype as a documented deny-list", () => {
    expect(
      safeJsonParse('{"constructor":"Acme","prototype":1,"a":2}', {}),
    ).toEqual({ a: 2 });
  });
});

describe("LEAF-04", () => {
  it("is the reference acceptance set shared with ValidationPattern.EMAIL", () => {
    expect(isEmail("o'brien@example.com")).toBe(true);
    expect(isEmail("user@host.123")).toBe(true);
    expect(isEmail("a@b.c")).toBe(true);
    expect(isEmail("a..b@example.com")).toBe(false);
    expect(isEmail(`${"a".repeat(250)}@b.co`)).toBe(false);
  });
});
