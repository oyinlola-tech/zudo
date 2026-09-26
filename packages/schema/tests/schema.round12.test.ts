/**
 * Round 12 regressions for @zudojs/schema (academy findings #60, #61, #72, #73).
 */

import { ErrorCode, ValidationError } from "@zudojs/errors";
import { describe, expect, expectTypeOf, it } from "vitest";

import { isSchemaValidationError, schema } from "../src/index.js";
import type { Infer } from "../src/index.js";

describe("#60 string lengths count characters, not UTF-16 units", () => {
  it("agrees with @zudojs/validation on emoji", () => {
    expect(schema.string().min(3).safeParse("🛒🛒").success).toBe(false);
    expect(schema.string().max(2).safeParse("🛒🛒").success).toBe(true);
    expect(schema.string().length(2).safeParse("🛒🛒").success).toBe(true);
    expect(schema.string().length(4).safeParse("🛒🛒").success).toBe(false);
  });

  it("reports the character count it measured", () => {
    const result = schema.string().min(3).safeParse("🛒🛒");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues[0]?.received).toBe("2");
  });
});

describe("#61 isSchemaValidationError recognises @zudojs/validation errors", () => {
  it("accepts validation's SchemaValidationError and keeps its issues", () => {
    // @zudojs/validation's SchemaValidationError is @zudojs/errors'
    // ValidationError with ErrorCode.SCHEMA_VALIDATION and an issue list;
    // schema cannot depend on validation, so build the same shape here.
    const error = new ValidationError("Schema validation failed.", {
      code: ErrorCode.SCHEMA_VALIDATION,
      issues: [{ path: ["email"], code: "invalid_format", message: "Invalid email" }],
    });
    expect(isSchemaValidationError(error)).toBe(true);
    if (isSchemaValidationError(error)) {
      expect(error.issues[0]?.path).toEqual(["email"]);
      expect(error.hasIssues()).toBe(true);
    }
  });

  it("still accepts the package's own errors and rejects the rest", () => {
    try {
      schema.object({ n: schema.number() }).parse({ n: "x" });
      expect.unreachable();
    } catch (error) {
      expect(isSchemaValidationError(error)).toBe(true);
    }
    expect(isSchemaValidationError(new Error("x"))).toBe(false);
    expect(
      isSchemaValidationError(
        new ValidationError("plain", {
          issues: [{ path: [], code: "x", message: "m" }],
        }),
      ),
    ).toBe(false);
    expect(isSchemaValidationError({ code: "ERR_SCHEMA_VALIDATION", issues: [] })).toBe(
      false,
    );
  });
});

describe("#72 UnionSchema.parse() return type", () => {
  it("narrows to the literal union like Infer<> does, without `as const`", () => {
    const status = schema.union([
      schema.enum(["active", "paused"]),
      schema.literal("archived"),
    ]);
    type Status = Infer<typeof status>;
    const parsed = status.parse("active");
    expectTypeOf<Status>().toEqualTypeOf<"active" | "paused" | "archived">();
    expectTypeOf(parsed).toEqualTypeOf<"active" | "paused" | "archived">();
    expect(parsed).toBe("active");
  });

  it("keeps literals inside an object shape", () => {
    const event = schema.object({ kind: schema.enum(["created", "deleted"]) });
    expectTypeOf(event.parse({ kind: "created" }).kind).toEqualTypeOf<
      "created" | "deleted"
    >();
  });

  it("keeps the transform output in the union", () => {
    const value = schema.union([
      schema.string().transform((s) => s.length),
      schema.literal(false),
    ]);
    const parsed = value.parse("abc");
    expectTypeOf(parsed).toEqualTypeOf<number | false>();
    expect(parsed).toBe(3);
  });
});

describe("#73 composite schemas have the chainable modifiers", () => {
  const range = schema.object({ from: schema.number(), to: schema.number() });

  it("object.refine()", () => {
    const ordered = range.refine((r) => r.from <= r.to, "from must not exceed to");
    expect(ordered.safeParse({ from: 1, to: 2 }).success).toBe(true);
    const bad = ordered.safeParse({ from: 3, to: 2 });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.issues[0]?.message).toBe("from must not exceed to");
  });

  it("object.optional()/nullable()/default()/transform()", () => {
    expect(range.optional().parse(undefined)).toBeUndefined();
    expect(range.nullable().parse(null)).toBeNull();
    expect(range.default({ from: 0, to: 0 }).parse(undefined)).toEqual({ from: 0, to: 0 });
    expect(range.transform((r) => r.to - r.from).parse({ from: 1, to: 4 })).toBe(3);
  });

  it("an optional object is an optional key of an outer shape", () => {
    const outer = schema.object({ range: range.optional() });
    expect(outer.safeParse({}).success).toBe(true);
  });

  it("array, record, map, set and intersection refine too", () => {
    expect(
      schema.array(schema.number()).refine((a) => a.length > 0, "empty").safeParse([])
        .success,
    ).toBe(false);
    expect(
      schema
        .record(schema.number())
        .refine((r) => "a" in r, "needs a")
        .safeParse({ a: 1 }).success,
    ).toBe(true);
    expect(
      schema.map(schema.string(), schema.number()).optional().parse(undefined),
    ).toBeUndefined();
    expect(schema.set(schema.number()).nullable().parse(null)).toBeNull();
    expect(
      schema
        .intersection(schema.object({ a: schema.number() }), schema.object({ b: schema.number() }))
        .refine((v) => v.a < v.b, "a < b")
        .safeParse({ a: 2, b: 1 }).success,
    ).toBe(false);
  });
});
