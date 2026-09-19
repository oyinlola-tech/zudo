import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ValidationError as SharedValidationError } from "@zudojs/errors";
import {
  assertDepthWithinLimit,
  assertSizeWithinLimit,
  createConstraint,
  createValidationRegistry,
  estimateSerializedSize,
  everyItem,
  getSerializationDepth,
  hasCircularReference,
  minLength,
  not,
  unwrapValidation,
  failure,
  ValidationError,
  ValidationResultError,
  matches,
} from "../src/index.js";

describe("VAL-01", () => {
  it("sparse arrays do not crash the structural guards", () => {
    // eslint-disable-next-line no-sparse-arrays
    const sparse = [1, , 3];
    expect(hasCircularReference(sparse)).toBe(false);
    expect(() => assertDepthWithinLimit(sparse, 10)).not.toThrow();
    expect(getSerializationDepth(sparse)).toBe(1);
    expect(estimateSerializedSize(sparse)).toBeGreaterThan(0);
  });
});

describe("VAL-02", () => {
  it("shared subtrees are not re-walked for cycle and depth checks", () => {
    let node: unknown = { leaf: true };
    for (let i = 0; i < 22; i++) node = [node, node];
    const started = Date.now();
    expect(hasCircularReference(node)).toBe(false);
    expect(() => assertDepthWithinLimit(node, 100)).not.toThrow();
    expect(getSerializationDepth(node)).toBe(23);
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("a shared node reached again at a deeper level still counts that depth", () => {
    const shared = { a: { b: {} } };
    expect(getSerializationDepth({ x: shared, y: { z: shared } })).toBe(5);
    expect(() => assertDepthWithinLimit({ x: shared, y: { z: shared } }, 4)).toThrow();
  });
});

describe("VAL-03", () => {
  it("the size guard measures what toJSON returns", () => {
    const value = { toJSON: () => "x".repeat(5000) };
    expect(estimateSerializedSize(value)).toBeGreaterThan(5000);
    expect(() => assertSizeWithinLimit(value, 1000)).toThrow();
  });
});

describe("VAL-04", () => {
  it("a rule with schema and constraints runs both", () => {
    const registry = createValidationRegistry().register({
      name: "slug",
      schema: z.string(),
      constraints: [minLength(3)],
    });
    expect(registry.validate("slug", "ab").success).toBe(false);
    expect(registry.validate("slug", "abc").success).toBe(true);
    expect(registry.validate("slug", 5).success).toBe(false);
  });
});

describe("VAL-05", () => {
  it("validation errors are instances of @zudojs/errors ValidationError", () => {
    expect(new ValidationError("bad")).toBeInstanceOf(SharedValidationError);
    const issue = { path: ["a"], code: "x", message: "m" };
    expect(() => unwrapValidation(failure([issue]))).toThrow(SharedValidationError);
    expect(new ValidationResultError([issue]).issues).toEqual([issue]);
  });
});

describe("VAL-06", () => {
  it("not() fails closed on wrong types and throwing constraints", () => {
    const noScript = not(matches(/<script/));
    expect(noScript.validate("<script>" as never)).toBe(false);
    expect(noScript.validate(["<script>"] as never)).toBe(false);
    expect(noScript.validate("hello" as never)).toBe(true);
    const throws = createConstraint<unknown>(() => {
      throw new Error("boom");
    });
    expect(not(throws).validate(null)).toBe(false);
  });
});

describe("VAL-07", () => {
  it("everyItem checks sparse-array holes", () => {
    const allStrings = everyItem(
      createConstraint<unknown>((v) => typeof v === "string"),
    );
    expect(allStrings.validate(new Array(3))).toBe(false);
    expect(allStrings.validate(["a", "b"])).toBe(true);
  });
});

describe("LEAF-10", () => {
  const leaky = [
    { path: ["password"], code: "too_short", message: "too short", received: "hunter2" },
  ];
  it("toJSON keeps the redaction of issue values and context", () => {
    const err = new ValidationError("bad", leaky, {
      context: { password: "ctx-secret", field: "x" },
    });
    const json = JSON.stringify(err);
    expect(json).not.toContain("hunter2");
    expect(json).not.toContain("ctx-secret");
    expect(json).toContain("too short");
    expect(err.issues[0]?.received).toBe("hunter2");
    expect(JSON.stringify(new ValidationResultError(leaky))).not.toContain("hunter2");
  });
});
