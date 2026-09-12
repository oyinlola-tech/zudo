/**
 * Round-9 audit regression tests for @zudojs/validation.
 *
 * One describe block per finding id.
 */

import { describe, it, expect } from "vitest";

import {
  any,
  first,
  assertDepthWithinLimit,
  getSerializationDepth,
  createValidationError,
} from "../src/index.js";

describe("VAL-R9-01: any() never echoes the rejected value", () => {
  it("reports no_validator_succeeded without `received` when given no validators", () => {
    const result = any<string>()("hunter2");
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.code).toBe("no_validator_succeeded");
    expect(result.issues[0]).not.toHaveProperty("received");
    expect(JSON.stringify(result.issues)).not.toContain("hunter2");
  });

  it("matches first() for the same situation", () => {
    const viaAny = any<string>()("secret");
    const viaFirst = first<string>()("secret");
    expect(viaAny).toEqual(viaFirst);
  });

  it("a ValidationError built from the issues carries nothing of the input", () => {
    const result = any<string>()("hunter2");
    if (result.success) throw new Error("expected failure");
    const error = createValidationError(result.issues);
    expect(JSON.stringify(error.toJSON())).not.toContain("hunter2");
  });
});

describe("VAL-R9-02: getSerializationDepth agrees with assertDepthWithinLimit", () => {
  it("counts a container as one level even when it is empty", () => {
    expect(getSerializationDepth(1)).toBe(0);
    expect(getSerializationDepth({})).toBe(1);
    expect(getSerializationDepth([])).toBe(1);
    expect(getSerializationDepth({ a: 1 })).toBe(1);
    expect(getSerializationDepth({ a: {} })).toBe(2);
    expect(getSerializationDepth({ a: { b: 1 } })).toBe(2);
    expect(getSerializationDepth({ a: [[]] })).toBe(3);
  });

  it("a value passes the depth guard at exactly its measured depth", () => {
    const samples: unknown[] = [
      {},
      [],
      { a: {} },
      { a: [[]] },
      { a: { b: 1 } },
      { a: { b: { c: [] } } },
      new Map([["k", {}]]),
      new Set([[]]),
    ];
    for (const sample of samples) {
      const depth = getSerializationDepth(sample);
      expect(() => assertDepthWithinLimit(sample, depth)).not.toThrow();
      expect(() => assertDepthWithinLimit(sample, depth - 1)).toThrow();
    }
  });
});
