import { describe, expect, it } from "vitest";

import { findUnsafeKey } from "../src/index.js";

describe("findUnsafeKey", () => {
  it("findUnsafeKey walks nested arrays and objects without recursion", () => {
    let deep: unknown = { __proto__: null, leaf: 1 };
    for (let i = 0; i < 10_000; i += 1) deep = [deep];
    expect(findUnsafeKey(deep)).toBeUndefined();
    expect(findUnsafeKey(JSON.parse('[[{"a":{"__proto__":1}}]]'))).toBe("__proto__");
    expect(findUnsafeKey({ constructorName: 1, protoType: 2 })).toBeUndefined();
    const cyclic: Record<string, unknown> = {};
    cyclic["self"] = cyclic;
    expect(findUnsafeKey(cyclic)).toBeUndefined();
  });

  it("finds a key at the top level and ignores class instances", () => {
    expect(findUnsafeKey(JSON.parse('{"prototype":{}}'))).toBe("prototype");
    expect(findUnsafeKey(new Map([["__proto__", 1]]))).toBeUndefined();
    expect(findUnsafeKey("__proto__")).toBeUndefined();
  });
});
