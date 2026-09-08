/**
 * @zudojs/validation — Hardening regression tests.
 *
 * The structural guards get the most coverage here: each of them previously
 * failed in the direction that lets a hostile payload through, or turns a
 * legitimate one away, while reporting success either way.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  assertDepthWithinLimit,
  assertNoCircularReference,
  assertSizeWithinLimit,
  checkConstraint,
  checkConstraints,
  createValidationComposer,
  createValidationError,
  createValidationFactory,
  estimateSerializedSize,
  everyItem,
  first,
  getSerializationDepth,
  hasCircularReference,
  isoDate,
  mapValidated,
  matches,
  minLength,
  normalizeArray,
  normalizeEmail,
  normalizeIdentifier,
  parseNullable,
  parseOptional,
  parseRecord,
  slug,
  ascii,
  uuid,
  email,
  tapValidated,
  toFieldErrors,
  ValidationRegistry,
  ValidationErrorCode,
} from "../src/index.js";
import type { ValidationResult } from "../src/index.js";

/* ─── VAL-01 / VAL-10: depth guard ────────────────────────────────────────── */

describe("depth guard", () => {
  const deepArray = (levels: number): unknown =>
    JSON.parse("[".repeat(levels) + "]".repeat(levels));

  it("rejects a deeply nested payload without exhausting the stack", () => {
    expect(() => assertDepthWithinLimit(deepArray(20_000), 32)).toThrow(
      /depth|too deep|nesting/i,
    );
  });

  it("costs no more than the limit, not the size of the input", () => {
    const started = Date.now();
    expect(() => assertDepthWithinLimit(deepArray(200_000), 8)).toThrow();
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("accepts a payload within the limit", () => {
    expect(() =>
      assertDepthWithinLimit({ a: { b: { c: 1 } } }, 8),
    ).not.toThrow();
  });

  it("measures depth without following a cycle", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => getSerializationDepth(cyclic)).not.toThrow();
    expect(getSerializationDepth({ a: { b: 1 } })).toBe(2);
  });
});

/* ─── VAL-02 / VAL-19: size guard ─────────────────────────────────────────── */

describe("size guard", () => {
  /** A compact graph whose serialized form doubles at every level. */
  const amplified = (levels: number): unknown => {
    let node: unknown = { pad: "x".repeat(64) };
    for (let i = 0; i < levels; i++) node = { a: node, b: node };
    return node;
  };

  it("counts a shared subtree once per occurrence, as a serializer would", () => {
    const shared = { pad: "x".repeat(32) };
    const twice = { a: shared, b: shared };

    expect(estimateSerializedSize(twice)).toBeGreaterThan(
      estimateSerializedSize({ a: shared }),
    );
  });

  it("rejects an amplification payload that used to pass", () => {
    expect(() => assertSizeWithinLimit(amplified(22), 10_000)).toThrow(
      /too large|payload/i,
    );
  });

  it("stops counting once the budget is passed", () => {
    const started = Date.now();
    expect(() => assertSizeWithinLimit(amplified(24), 1_000)).toThrow();
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("accepts a payload within the budget", () => {
    expect(() =>
      assertSizeWithinLimit({ name: "acme", count: 3 }, 10_000),
    ).not.toThrow();
  });

  it("charges numbers their worst-case JSON width", () => {
    expect(estimateSerializedSize(1.7976931348623157e308)).toBe(21);
  });
});

/* ─── VAL-03: circular detection ──────────────────────────────────────────── */

describe("circular reference detection", () => {
  it("accepts a shared reference that is not a cycle", () => {
    const shared = { a: 1 };
    expect(hasCircularReference([shared, shared])).toBe(false);
    expect(hasCircularReference({ x: shared, y: { z: shared } })).toBe(false);
  });

  it("still detects a genuine self-reference", () => {
    const cyclic: Record<string, unknown> = { name: "a" };
    cyclic.self = cyclic;
    expect(hasCircularReference(cyclic)).toBe(true);
    expect(() => assertNoCircularReference(cyclic)).toThrow(/circular/i);
  });

  it("detects a cycle through an array and reports its path", () => {
    const inner: unknown[] = [];
    inner.push({ back: inner });
    expect(() => assertNoCircularReference(inner)).toThrow(/root\[0\]\.back/);
  });

  it("does not exhaust the stack on a deep acyclic graph", () => {
    const deep = JSON.parse("[".repeat(5000) + "]".repeat(5000)) as unknown;
    expect(() => assertNoCircularReference(deep, "root", 10_000)).not.toThrow();
  });
});

/* ─── VAL-04: rejected input must not be echoed ───────────────────────────── */

describe("issue redaction", () => {
  it("does not attach the rejected value to a constraint issue", () => {
    const result = checkConstraints([minLength(64)], "hunter2-my-password");
    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.issues[0]).not.toHaveProperty("received");
    expect(JSON.stringify(result)).not.toContain("hunter2");
  });

  it("keeps the rejected value out of the exposed 400 body", () => {
    const result = checkConstraint(minLength(64), "s3cret-token");
    const error = createValidationError(result.success ? [] : result.issues);

    expect(JSON.stringify(error.toJSON())).not.toContain("s3cret-token");
  });
});

/* ─── VAL-05 / VAL-09: prototype safety ───────────────────────────────────── */

describe("prototype safety", () => {
  it("refuses a __proto__ key instead of hijacking the result prototype", () => {
    const result = parseRecord(
      z.object({ isAdmin: z.boolean() }),
      JSON.parse('{"__proto__":{"isAdmin":true}}') as Record<string, unknown>,
    );

    expect(result.success).toBe(false);
    expect(({} as { isAdmin?: boolean }).isAdmin).toBeUndefined();
  });

  it("returns a null-prototype object for valid input", () => {
    const result = parseRecord(z.number(), { a: 1, b: 2 });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(Object.getPrototypeOf(result.data)).toBeNull();
    expect(Object.keys(result.data)).toEqual(["a", "b"]);
  });

  it("reports a field named after an Object.prototype member", () => {
    expect(
      toFieldErrors([
        { path: ["constructor"], code: "c", message: "required" },
        { path: ["toString"], code: "c", message: "also required" },
      ]),
    ).toEqual({ constructor: "required", toString: "also required" });
  });

  it("keeps the first issue per field", () => {
    expect(
      toFieldErrors([
        { path: ["email"], code: "a", message: "first" },
        { path: ["email"], code: "b", message: "second" },
      ]),
    ).toEqual({ email: "first" });
  });
});

/* ─── VAL-06 / VAL-15: string constraints ─────────────────────────────────── */

describe("string constraints", () => {
  it("is stable across calls when given a global regex", () => {
    const constraint = matches(/^[a-z]+$/g);
    expect([1, 2, 3, 4].map(() => constraint.validate("abc"))).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });

  it("counts code points rather than UTF-16 units", () => {
    expect(minLength(2).validate("🙂🙂")).toBe(true);
    expect(minLength(3).validate("🙂🙂")).toBe(false);
  });

  it("accepts UUIDv7 and the nil UUID", () => {
    expect(uuid.validate("018f5e2a-1c3d-7abc-8def-0123456789ab")).toBe(true);
    expect(uuid.validate("00000000-0000-0000-0000-000000000000")).toBe(true);
    expect(uuid.validate("not-a-uuid")).toBe(false);
  });

  it("rejects control characters from the ascii constraint", () => {
    expect(ascii.validate("plain text")).toBe(true);
    expect(ascii.validate("header\r\nInjected: yes")).toBe(false);
    expect(ascii.validate("nul byte")).toBe(false);
  });

  it("describes the slug it actually accepts", () => {
    expect(slug.validate("my-slug-1")).toBe(true);
    expect(slug.validate("My_Slug")).toBe(false);
    expect(slug.message).not.toContain("underscore");
  });

  it("rejects the email shapes that are certainly wrong", () => {
    expect(email.validate("user@example.com")).toBe(true);
    expect(email.validate("a@b..c")).toBe(false);
    expect(email.validate("a@b")).toBe(false);
    expect(email.validate("a b@example.com")).toBe(false);
  });

  it("rejects calendar-invalid ISO dates", () => {
    expect(isoDate.validate("2024-01-31")).toBe(true);
    expect(isoDate.validate("2024-01-01T00:00:00+02:00")).toBe(true);
    expect(isoDate.validate("2024-02-31")).toBe(false);
    expect(isoDate.validate("2024-13-45T99:99:99Z")).toBe(false);
  });
});

/* ─── VAL-07: wrong-typed input must not throw ────────────────────────────── */

describe("constraint type safety", () => {
  it("returns a failure rather than throwing on a mistyped value", () => {
    const registry = new ValidationRegistry();
    registry.registerConstraints("tags", [everyItem(minLength(1))]);

    const result = registry.validate("tags", 42);
    expect(result.success).toBe(false);
  });

  it("guards scalar constraints the same way", () => {
    expect(minLength(1).validate(undefined as unknown as string)).toBe(false);
    expect(() =>
      checkConstraints([minLength(1)], 42 as unknown as string),
    ).not.toThrow();
  });
});

/* ─── VAL-08: error code mapping ──────────────────────────────────────────── */

describe("validation error codes", () => {
  it("maps to a real ErrorCode rather than casting one enum into another", () => {
    const error = createValidationError([], {
      code: ValidationErrorCode.REQUIRED,
    });

    expect(error.code).toMatch(/^ERR_/);
    expect(error.code).not.toBe(ValidationErrorCode.REQUIRED);
    expect(error.validationCode).toBe(ValidationErrorCode.REQUIRED);
  });
});

/* ─── VAL-11 / VAL-14 / VAL-17: composer ──────────────────────────────────── */

describe("composer", () => {
  const ok = (value: string): ValidationResult<string> => ({
    success: true,
    data: value,
    issues: [],
  });
  const fails = (message: string) => (): ValidationResult<string> => ({
    success: false,
    issues: [{ path: [], code: "x", message }],
  });

  it("returns the mapped value from mapValidated", () => {
    const step = mapValidated(ok, (value) => value.length);
    const result = step("abcd");
    expect(result.success && result.data).toBe(4);
  });

  it("keeps the value with tapValidated", () => {
    const seen: string[] = [];
    const step = tapValidated(ok, (value) => seen.push(value));
    expect(step("abc").success && step("abc").data).toBe("abc");
    expect(seen).toContain("abc");
  });

  it("halts at the first failing step by default", () => {
    let reached = false;
    const composer = createValidationComposer<string>([
      fails("first"),
      () => {
        reached = true;
        return ok("x");
      },
    ]);

    composer.validate("input");
    expect(reached).toBe(false);
    expect(composer.stopOnFirstError).toBe(true);
  });

  it("collects every issue when asked to", () => {
    const composer = createValidationComposer<string>(
      [fails("first"), fails("second")],
      { stopOnFirstError: false },
    );

    const result = composer.validate("input");
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues.map((i) => i.message)).toEqual(["first", "second"]);
  });

  it("first() reports only the last alternative's issues", () => {
    const step = first(fails("a"), fails("b"), fails("c"));
    const result = step("x");
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues.map((i) => i.message)).toEqual(["c"]);
  });
});

/* ─── VAL-12 / VAL-13: normalizers ────────────────────────────────────────── */

describe("normalizers", () => {
  it("does not leak map's index into the normalizer", () => {
    const asNumber = (value: string): string =>
      String(Number.parseInt(value, 10));
    expect(normalizeArray(["10", "10", "10"], asNumber)).toEqual([
      "10",
      "10",
      "10",
    ]);
  });

  it("folds compatibility forms when normalizing an identifier", () => {
    expect(normalizeIdentifier("ａｃｍｅ")).toBe("acme");
    expect(normalizeIdentifier("  ACME  ")).toBe("acme");
    expect(normalizeIdentifier("ﬁle")).toBe("file");
  });

  it("lowercases only the domain of an email address", () => {
    expect(normalizeEmail("  User.Name@EXAMPLE.COM ")).toBe(
      "User.Name@example.com",
    );
  });
});

/* ─── VAL-16 / VAL-18: parser options and factory scoping ─────────────────── */

describe("parser and factory", () => {
  it("applies the path prefix to optional and nullable parses", () => {
    const optional = parseOptional(z.number(), "no", {
      pathPrefix: ["config"],
    });
    expect(optional.success).toBe(false);
    if (!optional.success) {
      expect(optional.issues[0]?.path[0]).toBe("config");
    }

    const nullable = parseNullable(z.number(), "no", {
      pathPrefix: ["config"],
    });
    if (!nullable.success) {
      expect(nullable.issues[0]?.path[0]).toBe("config");
    }
  });

  it("gives each factory its own registry unless one is shared explicitly", () => {
    const a = createValidationFactory();
    const b = createValidationFactory();

    a.registerSchema("user", z.object({ id: z.string() }));
    expect(a.registry.has("user")).toBe(true);
    expect(b.registry.has("user")).toBe(false);
  });

  it("freezes registered constraint lists", () => {
    const registry = new ValidationRegistry();
    registry.registerConstraints("name", [minLength(1)]);

    const rule = registry.require("name");
    expect(Object.isFrozen(rule.constraints)).toBe(true);
  });
});
