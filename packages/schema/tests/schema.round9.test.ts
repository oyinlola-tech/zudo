/**
 * Regression tests for the round-9 audit findings (SCHEMA-R9-*).
 */

import { describe, it, expect } from "vitest";

import { schema, refineSchema, transformSchema } from "../src/index.js";

describe("SCHEMA-R9-01: a missing object key is required only when its schema rejects undefined", () => {
  it("accepts a missing key for schema.undefined()", () => {
    const result = schema.object({ a: schema.undefined() }).safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts a missing key for a union that includes undefined", () => {
    const result = schema
      .object({ a: schema.union([schema.string(), schema.undefined()]) })
      .safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts a missing key for refine/transform/lazy wrapped around an optional", () => {
    const refined = schema.object({
      a: refineSchema(schema.string().optional(), () => true, "never"),
    });
    expect(refined.safeParse({}).success).toBe(true);

    const transformed = schema.object({
      a: transformSchema(schema.string().optional(), (v) => v ?? "fallback"),
    });
    const result = transformed.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ a: "fallback" });

    const lazy = schema.object({
      a: schema.lazy(() => schema.string().optional()),
    });
    expect(lazy.safeParse({}).success).toBe(true);
  });

  it("still reports a genuinely required key, without leaking probe issues", () => {
    const result = schema
      .object({ a: schema.string(), b: schema.coerce.number() })
      .safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.map((i) => i.code)).toEqual(["required", "required"]);
      expect(result.issues.map((i) => i.path)).toEqual([["a"], ["b"]]);
    }
  });

  it("required() still overrides a schema that would accept undefined", () => {
    const base = schema.object({ a: schema.undefined() });
    expect(base.required().safeParse({}).success).toBe(false);
  });
});

describe("SCHEMA-R9-02: safeParse never throws while describing an unusual input", () => {
  it("reports a BigInt against literal and enum schemas", () => {
    const literal = schema.literal("a").safeParse(1n);
    expect(literal.success).toBe(false);
    if (!literal.success) expect(literal.issues[0]?.received).toBe("1n");

    const enumResult = schema.enum(["a", "b"]).safeParse(2n);
    expect(enumResult.success).toBe(false);
    if (!enumResult.success) expect(enumResult.issues[0]?.received).toBe("2n");
  });

  it("reports a circular object against a literal schema", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const result = schema.literal("a").safeParse(circular);
    expect(result.success).toBe(false);
  });

  it("reports a null-prototype discriminator value instead of throwing", () => {
    const union = schema.discriminatedUnion("t", [
      schema.object({ t: schema.literal("x") }),
    ]);
    const result = union.safeParse({ t: Object.create(null) });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues[0]?.code).toBe("invalid_union");
  });

  it("reports a transform or refinement that throws a value String() cannot render", () => {
    const hostile = Object.create(null) as object;

    const transformed = schema
      .string()
      .transform(() => {
        throw hostile;
      })
      .safeParse("x");
    expect(transformed.success).toBe(false);
    if (!transformed.success) {
      expect(transformed.issues[0]?.code).toBe("transform_failed");
    }

    const refined = schema
      .string()
      .refine(() => {
        throw hostile;
      }, "never")
      .safeParse("x");
    expect(refined.success).toBe(false);
    if (!refined.success) expect(refined.issues[0]?.code).toBe("refine_failed");
  });
});
