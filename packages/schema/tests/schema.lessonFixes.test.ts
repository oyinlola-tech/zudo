/**
 * Regressions reported by lesson writers against the published package:
 * non-HTTP URLs, absent optional keys, `partial()` defaults, modifiers on
 * every primitive, real calendar dates and transform input inference.
 */

import { describe, expect, it } from "vitest";

import { schema } from "../src/index.js";
import type { Infer, SchemaInput } from "../src/index.js";

describe("string().url()", () => {
  it("keeps http/https as the default and refuses script URLs", () => {
    const url = schema.string().url();
    expect(url.safeParse("https://example.com/a").success).toBe(true);
    expect(url.safeParse("postgres://u:p@db:5432/app").success).toBe(false);
    expect(url.safeParse("javascript:alert(1)").success).toBe(false);
    expect(url.safeParse("data:text/html,<script>").success).toBe(false);
  });

  it("accepts the listed protocols, case-insensitively", () => {
    const databaseUrl = schema.string().url({ protocols: ["postgres", "PostgreSQL:"] });
    expect(databaseUrl.parse("postgres://u:p@db:5432/app")).toBe("postgres://u:p@db:5432/app");
    expect(databaseUrl.safeParse("postgresql://db/app").success).toBe(true);
    expect(databaseUrl.safeParse("https://db/app").success).toBe(false);
    expect(databaseUrl.safeParse("javascript:alert(1)").success).toBe(false);
    expect(databaseUrl.safeParse("not a url").success).toBe(false);
    expect(databaseUrl.safeParse(" postgres://db/app").success).toBe(false);
  });

  it('accepts any scheme with protocols: "any"', () => {
    const any = schema.string().url({ protocols: "any" });
    expect(any.safeParse("redis://cache:6379").success).toBe(true);
    expect(any.safeParse("mailto:a@b.c").success).toBe(true);
    expect(any.safeParse("nope").success).toBe(false);
  });

  it("rejects an invalid protocols option when the schema is built", () => {
    expect(() => schema.string().url({ protocols: [] })).toThrow(TypeError);
    expect(() => schema.string().url({ protocols: ["http s"] })).toThrow(TypeError);
  });
});

describe("absent optional keys", () => {
  const user = schema.object({ a: schema.number(), b: schema.string().optional() });

  it("stays absent instead of becoming an own undefined key", () => {
    const parsed = user.parse({ a: 1 });
    expect(parsed).toEqual({ a: 1 });
    expect(Object.hasOwn(parsed, "b")).toBe(false);
  });

  it("keeps a key the input held as undefined", () => {
    expect(Object.hasOwn(user.parse({ a: 1, b: undefined }), "b")).toBe(true);
  });

  it("types the optional key as an optional property", () => {
    const value: Infer<typeof user> = { a: 1 };
    expect(value).toEqual({ a: 1 });
  });

  it("partial() leaves out every absent key", () => {
    const parsed = user.partial().parse({});
    expect(Object.keys(parsed)).toEqual([]);
  });
});

describe("partial() and defaults", () => {
  const task = schema.object({
    title: schema.string(),
    done: schema.default(schema.boolean(), false),
    role: schema.default(schema.enum(["user", "admin"]), "user"),
  });

  it("does not apply defaults to absent keys", () => {
    expect(task.partial().parse({})).toEqual({});
    expect(task.partial().parse({ done: true })).toEqual({ done: true });
  });

  it("still validates present values", () => {
    expect(task.partial().safeParse({ role: "root" }).success).toBe(false);
  });

  it("the full schema still applies its defaults", () => {
    expect(task.parse({ title: "t" })).toEqual({ title: "t", done: false, role: "user" });
  });
});

describe("modifiers on every primitive", () => {
  it("boolean() has optional, nullable, default, refine and transform", () => {
    expect(schema.boolean().optional().parse(undefined)).toBeUndefined();
    expect(schema.boolean().nullable().parse(null)).toBeNull();
    expect(schema.boolean().default(true).parse(undefined)).toBe(true);
    expect(schema.boolean().refine((v) => v, "must be true").safeParse(false).success).toBe(false);
    expect(schema.boolean().transform((v) => (v ? 1 : 0)).parse(true)).toBe(1);
  });

  it("literal, enum, bigint, symbol and the coerce schemas have them too", () => {
    expect(schema.literal("x").optional().parse(undefined)).toBeUndefined();
    expect(schema.enum(["a", "b"]).default("a").parse(undefined)).toBe("a");
    expect(schema.bigint().nullable().parse(null)).toBeNull();
    expect(schema.symbol().optional().parse(undefined)).toBeUndefined();
    expect(schema.coerce.boolean().transform((v) => !v).parse("true")).toBe(false);
    expect(schema.coerce.bigint().default(5n).parse(undefined)).toBe(5n);
    expect(schema.coerce.number().transform((n) => n * 2).parse("2")).toBe(4);
  });
});

describe("date(), datetime() and time() check real values", () => {
  it("date() rejects impossible calendar dates", () => {
    const date = schema.string().date();
    for (const bad of ["2026-02-30", "2026-13-45", "2026-00-10", "2025-02-29", "2026-04-31"]) {
      expect(date.safeParse(bad).success, bad).toBe(false);
    }
    for (const good of ["2024-02-29", "2000-02-29", "2026-12-31", "2026-01-01"]) {
      expect(date.safeParse(good).success, good).toBe(true);
    }
    expect(date.safeParse("1900-02-29").success).toBe(false);
  });

  it("datetime() rejects impossible times and offsets", () => {
    const datetime = schema.string().datetime();
    for (const bad of [
      "2026-02-30T10:00:00Z",
      "2026-02-28T25:61:00Z",
      "2026-02-28T24:00:00Z",
      "2026-02-28T10:00:60Z",
      "2026-02-28T10:00:00+24:00",
      "2026-02-28T10:00:00+05:60",
    ]) {
      expect(datetime.safeParse(bad).success, bad).toBe(false);
    }
    for (const good of [
      "2026-02-28T23:59:59Z",
      "2026-02-28T00:00:00.123+05:30",
      "2026-02-28T10:00:00-08:00",
      "2026-02-28T10:00:00",
    ]) {
      expect(datetime.safeParse(good).success, good).toBe(true);
    }
  });

  it("time() rejects out-of-range clocks", () => {
    const time = schema.string().time();
    expect(time.safeParse("23:59").success).toBe(true);
    expect(time.safeParse("24:00").success).toBe(false);
    expect(time.safeParse("12:60:00").success).toBe(false);
  });
});

describe("SchemaInput of a chained transform", () => {
  it("is the input type, not the output type", () => {
    const toNumber = schema.string().transform(Number);
    const input: SchemaInput<typeof toNumber> = "42";
    // @ts-expect-error the input of string().transform(Number) is a string
    const wrong: SchemaInput<typeof toNumber> = 42;
    const output: Infer<typeof toNumber> = toNumber.parse(input);
    expect([output, wrong]).toEqual([42, 42]);
  });

  it("keeps the output type of a transformed object field", () => {
    const shape = schema.object({ n: schema.transform(schema.string(), Number) });
    // @ts-expect-error the parsed field is a number, not a string
    const bad: Infer<typeof shape> = { n: "1" };
    expect(shape.parse({ n: "1" })).toEqual({ n: 1 });
    expect(bad).toBeDefined();
  });
});
