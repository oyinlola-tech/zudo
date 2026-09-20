import { describe, it, expect } from "vitest";
import { z } from "zod";
import { SCHEMA_FORBIDDEN_KEYS, SerializationLimits } from "@zudojs/constants";
import {
  CircularReferenceError,
  SerializationDepthError,
} from "@zudojs/errors";
import {
  assertNoCircularReference,
  estimateSerializedSize,
  parseRecord,
} from "../src/index.js";

/** A DAG of `levels` shared `{a:node,b:node}` pairs: 2^levels expansions. */
function sharedDag(levels: number): unknown {
  let node: unknown = { leaf: 1 };
  for (let index = 0; index < levels; index++) {
    node = { a: node, b: node };
  }
  return node;
}

/** `{n:{n:…{leaf:1}}}`, `levels` deep. */
function deepObject(levels: number): unknown {
  let value: unknown = { leaf: 1 };
  for (let index = 0; index < levels; index++) value = { n: value };
  return value;
}

describe("TYPE-02 — estimateSerializedSize has a finite default budget", () => {
  it("returns within the default budget on a shared-subtree DAG, quickly", () => {
    const started = Date.now();
    const size = estimateSerializedSize(sharedDag(40));
    const elapsed = Date.now() - started;

    expect(size).toBeLessThanOrEqual(SerializationLimits.MAX_SIZE * 2);
    expect(elapsed).toBeLessThan(5000);
  });

  it("still measures ordinary values exactly", () => {
    expect(estimateSerializedSize({ a: 1, b: "two" })).toBe(
      estimateSerializedSize({ a: 1, b: "two" }, Number.POSITIVE_INFINITY),
    );
  });

  it("honours a smaller explicit budget", () => {
    expect(estimateSerializedSize(sharedDag(40), 1000)).toBeLessThan(
      SerializationLimits.MAX_SIZE,
    );
  });
});

describe("TYPE-03 — a deep non-circular graph is a depth error, not a cycle", () => {
  it("assertNoCircularReference reports depth as SerializationDepthError", () => {
    let thrown: unknown;
    try {
      assertNoCircularReference(deepObject(600), "root", 512);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(SerializationDepthError);
    expect(thrown).not.toBeInstanceOf(CircularReferenceError);
  });

  it("still reports a genuine cycle as a circular reference", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic["self"] = cyclic;

    expect(() => assertNoCircularReference(cyclic)).toThrow(
      CircularReferenceError,
    );
  });
});

describe("TYPE-08 — the forbidden-key set is the shared immutable one", () => {
  it("rejects every key listed in SCHEMA_FORBIDDEN_KEYS", () => {
    for (const key of SCHEMA_FORBIDDEN_KEYS) {
      const values = Object.create(null) as Record<string, unknown>;
      Object.defineProperty(values, key, { value: 1, enumerable: true });

      const result = parseRecord(z.unknown(), values);

      expect(result.success, `key ${key} must be rejected`).toBe(false);
      if (!result.success) {
        expect(result.issues[0]?.code).toBe("forbidden_key");
      }
    }
  });

  it("uses a set that cannot be emptied at runtime", () => {
    expect(() => (SCHEMA_FORBIDDEN_KEYS as Set<string>).clear()).toThrow();
    expect(SCHEMA_FORBIDDEN_KEYS.has("__proto__")).toBe(true);
  });
});
