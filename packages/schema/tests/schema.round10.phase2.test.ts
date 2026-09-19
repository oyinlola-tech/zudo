/**
 * Round 10 phase 2 regressions for @zudojs/schema (cross-package handoffs).
 */

import { describe, expect, it } from "vitest";
import { SCHEMA_DEFAULT_MAX_OBJECT_KEYS, SerializationLimits } from "@zudojs/constants";
import { schema, SchemaValidationSignal } from "../src/index.js";

describe("SER-03 (shared MAX_BIGINT_DIGITS)", () => {
  const max = SerializationLimits.MAX_BIGINT_DIGITS;
  const coerce = schema.coerce.bigint();

  it("accepts exactly MAX_BIGINT_DIGITS digits, with or without a sign", () => {
    const digits = "9".repeat(max);
    expect(coerce.safeParse(digits).success).toBe(true);
    expect(coerce.safeParse(`-${digits}`)).toEqual({
      success: true,
      data: -BigInt(digits),
    });
  });

  it("rejects one digit more before BigInt() runs", () => {
    expect(coerce.safeParse("9".repeat(max + 1)).success).toBe(false);
  });
});

describe("SCHEMA-03 (phase 2 confirmation)", () => {
  const big: Record<string, number> = {};
  for (let i = 0; i < SCHEMA_DEFAULT_MAX_OBJECT_KEYS + 50; i++) big[`k${i}`] = i;
  const Base = schema.object({ id: schema.number(), name: schema.string() });
  const input = { id: 1, name: "a", ...big };

  it("strict objects are bounded before the unknown-key walk", () => {
    const result = Base.strict().safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues).toHaveLength(1);
  });

  it("a raised maxKeys survives pick, omit, partial, extend and merge", () => {
    const wide = Base.passthrough().maxKeys(500);
    const derived = [
      wide.pick(["id", "name"]),
      wide.omit(["name"]),
      wide.partial(),
      wide.extend(schema.object({ extra: schema.string().optional() })),
      wide.merge(schema.object({ other: schema.number().optional() })),
    ];
    for (const s of derived) expect(s.safeParse(input).success).toBe(true);
  });
});

describe("VAL-05/CV-02 (SchemaValidationSignal, declined)", () => {
  it("never escapes parse() or safeParse()", () => {
    const s = schema.union([schema.number(), schema.string()]);
    expect(() => s.parse(true)).toThrow();
    try {
      s.parse(true);
    } catch (error) {
      expect(error).not.toBeInstanceOf(SchemaValidationSignal);
    }
    expect(s.safeParse(true).success).toBe(false);
  });
});
