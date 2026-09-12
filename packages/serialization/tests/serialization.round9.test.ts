/**
 * Regression tests for the round-9 audit findings (SER-R9-*).
 */

import { describe, it, expect } from "vitest";

import { JSONSerializer, createSerializer } from "../src/index.js";

describe("SER-R9-01: an explicit maxDepth is enforced on the fast path too", () => {
  const deep = [[[[1]]]];
  const deepJson = "[[[[1]]]]";

  it("rejects over-deep input on deserialize without preserveTypes", () => {
    const serializer = new JSONSerializer();
    expect(() => serializer.deserialize(deepJson, { maxDepth: 2 })).toThrow(
      /depth/i,
    );
    expect(serializer.deserialize(deepJson, { maxDepth: 4 })).toEqual(deep);
  });

  it("rejects over-deep values on serialize without preserveTypes", () => {
    const serializer = new JSONSerializer();
    expect(() => serializer.serialize(deep, { maxDepth: 2 })).toThrow(/depth/i);
    expect(serializer.serialize(deep, { maxDepth: 4 })).toBe(deepJson);
  });

  it("honours a per-instance default maxDepth from createSerializer/JSONSerializer", () => {
    const serializer = new JSONSerializer({ defaults: { maxDepth: 2 } });
    expect(() => serializer.deserialize(deepJson)).toThrow(/depth/i);
    expect(() => serializer.serialize(deep)).toThrow(/depth/i);

    const factory = createSerializer("json");
    expect(() => factory.deserialize(deepJson, { maxDepth: 2 })).toThrow(
      /depth/i,
    );
  });

  it("leaves the default fast path untouched when no maxDepth is given", () => {
    const serializer = new JSONSerializer();
    expect(serializer.deserialize(deepJson)).toEqual(deep);
    expect(serializer.serialize(deep)).toBe(deepJson);
  });
});
