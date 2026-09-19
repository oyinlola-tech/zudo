/**
 * @zudojs/testing — Audit round 10 regression tests.
 *
 * One describe block per finding. Every test here failed against the
 * pre-fix source.
 */

import { describe, it, expect } from "vitest";

import {
  assertSerializesCorrectly,
  deepEqual,
  findDifference,
} from "../src/index.js";

class User {
  constructor(readonly id: number) {}
}
class Admin {
  constructor(readonly id: number) {}
}

describe("tooling/TEST-01", () => {
  it("distinguishes Errors by message and by name", () => {
    expect(deepEqual(new Error("a"), new Error("b"))).toBe(false);
    expect(deepEqual(new TypeError("x"), new RangeError("x"))).toBe(false);
    expect(deepEqual(new Error("same"), new Error("same"))).toBe(true);
  });

  it("compares Error causes", () => {
    const a = new Error("x", { cause: { code: 1 } });
    const b = new Error("x", { cause: { code: 2 } });
    expect(findDifference(a, b)?.path).toBe("value.cause.code");
  });

  it("distinguishes class instances from each other and from plain objects", () => {
    expect(deepEqual(new User(1), new Admin(1))).toBe(false);
    expect(deepEqual(new User(1), { id: 1 })).toBe(false);
    expect(deepEqual(new User(1), new User(1))).toBe(true);
    expect(deepEqual(Object.assign(Object.create(null), { a: 1 }), { a: 1 })).toBe(true);
  });

  it("compares boxed primitives by value", () => {
    expect(deepEqual(new Number(1), new Number(2))).toBe(false);
    expect(deepEqual(new String("a"), new String("b"))).toBe(false);
    expect(deepEqual(new Number(1), new Number(1))).toBe(true);
  });

  it("never equates distinct Promises or weak collections", () => {
    expect(deepEqual(Promise.resolve(1), Promise.resolve(2))).toBe(false);
    expect(deepEqual(new WeakMap(), new WeakMap())).toBe(false);
  });

  it("requires the same typed-array constructor", () => {
    expect(deepEqual(new Uint8Array([1, 0]), new Uint16Array([1]))).toBe(false);
    expect(deepEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
  });

  it("does not let an identity hit remove an unrelated unmatched Set item", () => {
    const A = { v: 1 };
    const A2 = { v: 1 };
    const B = { v: 2 };
    expect(deepEqual(new Set([A, B]), new Set([A2, A]))).toBe(false);
    expect(deepEqual(new Set([A, B]), new Set([B, A2]))).toBe(true);
  });

  it("does not let an identity hit remove an unrelated unmatched Map key", () => {
    const A = { v: 1 };
    const A2 = { v: 1 };
    const B = { v: 2 };
    const actual = new Map<object, number>([[A, 1], [B, 2]]);
    expect(deepEqual(actual, new Map<object, number>([[A2, 1], [A, 1]]))).toBe(false);
    expect(deepEqual(actual, new Map<object, number>([[A2, 1], [B, 2]]))).toBe(true);
  });

  it("prefers the structurally equal Map key whose value also matches", () => {
    const A = { v: 1 };
    const A3 = { v: 1 };
    const actual = new Map<object, number>([[A, 1], [A3, 2]]);
    const expected = new Map<object, number>([[{ v: 1 }, 2], [{ v: 1 }, 1]]);
    expect(deepEqual(actual, expected)).toBe(true);
  });

  it("fails a serialization round trip that loses an Error", () => {
    expect(() => assertSerializesCorrectly(new Error("boom"))).toThrow(
      /round-trip failed/,
    );
  });
});
