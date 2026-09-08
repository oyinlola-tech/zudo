import { describe, it, expect } from "vitest";
import * as errors from "../src/index.js";
import { BaseError } from "../src/index.js";

type ErrorClass = new (...args: never[]) => BaseError;

/**
 * Candidate argument tuples tried, in order, until a constructor succeeds.
 * Covers `(message, options)`, positional string/number signatures and the
 * few classes that take arrays or objects first.
 */
const ARGUMENT_CANDIDATES: readonly unknown[][] = [
  ["message"],
  ["message", {}],
  ["a", "b"],
  ["a", "b", "c"],
  ["a", "b", "c", "d"],
  ["a", "b", "c", "d", "e"],
  [10, 20],
  ["a", 10],
  [10, "a"],
  [10],
  [10, {}],
  [["a", "b"]],
  [["a", "b"], "message"],
  [{}],
  [[]],
  ["a", "b", 10],
  ["a", 10, "b"],
  ["a", "b", 10, 20],
  ["a", ["b"]],
  ["a", {}, "b"],
  [],
];

function tryConstruct(
  Ctor: ErrorClass,
): { instance: BaseError; args: unknown[] } | undefined {
  for (const args of ARGUMENT_CANDIDATES) {
    try {
      const instance = new (Ctor as new (...a: unknown[]) => BaseError)(
        ...args,
      );
      if (instance instanceof BaseError) return { instance, args };
    } catch {
      // try the next candidate
    }
  }
  return undefined;
}

const exportedClasses = Object.entries(errors).filter(
  ([name, value]) =>
    typeof value === "function" &&
    /Error$/.test(name) &&
    value.prototype instanceof BaseError,
) as [string, ErrorClass][];

describe("withMetadata across every exported error class", () => {
  it("finds a substantial number of error classes", () => {
    expect(exportedClasses.length).toBeGreaterThan(100);
  });

  const constructed = exportedClasses.map(([name, Ctor]) => ({
    name,
    Ctor,
    built: tryConstruct(Ctor),
  }));

  it("can construct every exported class with dummy arguments", () => {
    const failures = constructed
      .filter((entry) => entry.built === undefined)
      .map((entry) => entry.name);
    expect(failures).toEqual([]);
  });

  for (const { name, Ctor, built } of constructed) {
    if (built === undefined) continue;
    it(`${name}.withMetadata preserves the instance and merges metadata`, () => {
      const original = built.instance;
      const copy = original.withMetadata({ requestId: "req-1", extra: 1 });

      expect(copy).not.toBe(original);
      expect(copy).toBeInstanceOf(Ctor);
      expect(copy).toBeInstanceOf(BaseError);
      expect(copy.name).toBe(original.name);
      expect(copy.message).toBe(original.message);
      expect(copy.code).toBe(original.code);
      expect(copy.category).toBe(original.category);
      expect(copy.severity).toBe(original.severity);
      expect(copy.statusCode).toBe(original.statusCode);
      expect(copy.expose).toBe(original.expose);
      expect(copy.isOperational).toBe(original.isOperational);
      expect(copy.cause).toBe(original.cause);
      expect(copy.stack).toBe(original.stack);

      // metadata: old keys kept, new keys added, frozen
      for (const [key, value] of Object.entries(original.metadata)) {
        expect(copy.metadata[key]).toEqual(value);
      }
      expect(copy.metadata.requestId).toBe("req-1");
      expect(copy.metadata.extra).toBe(1);
      expect(Object.isFrozen(copy.metadata)).toBe(true);
      expect(original.metadata.requestId).toBeUndefined();

      // every own (non-metadata) field is preserved
      for (const key of Object.keys(original)) {
        if (key === "metadata") continue;
        expect((copy as unknown as Record<string, unknown>)[key]).toEqual(
          (original as unknown as Record<string, unknown>)[key],
        );
      }

      // JSON output stays consistent with the original apart from metadata
      const { metadata: _m1, ...jsonOriginal } = original.toJSON();
      const { metadata: _m2, ...jsonCopy } = copy.toJSON();
      expect(jsonCopy).toEqual(jsonOriginal);
    });
  }
});
