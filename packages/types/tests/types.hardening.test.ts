/**
 * @zudojs/types — Hardening regression tests.
 *
 * The guards and converters here sit at trust boundaries in other packages,
 * so a wrong answer propagates rather than staying local.
 *
 * The "shared acceptance set" block pins the exact inputs that
 * `@zudojs/validation` asserts on with the same literals. Until both packages
 * are republished and one can import the other, identical assertions in both
 * suites are what keeps the two implementations from drifting apart again.
 */

import { describe, it, expect } from "vitest";
import {
  camelToKebab,
  camelToSnake,
  isEmail,
  isFiniteNumber,
  isIsoDateString,
  isIsoDateTimeString,
  isPositiveNumber,
  isPromise,
  isThenable,
  isUuid,
  isUuidV4,
  mapToObject,
  safeJsonParse,
  SeededRandom,
  snakeToCamel,
  systemRandom,
  toBoolean,
  toNumber,
  toString,
} from "../src/index.js";
import type { PseudoRandom, Random } from "../src/index.js";

/* ─── TYP-01 / TYP-12: prototype pollution ────────────────────────────────── */

describe("prototype safety", () => {
  it("does not let a Map key replace the result's prototype", () => {
    const hostile = new Map<string, unknown>(
      Object.entries(JSON.parse('{"__proto__":{"isAdmin":true}}')),
    );

    const result = mapToObject(hostile);

    expect(({} as { isAdmin?: boolean }).isAdmin).toBeUndefined();
    expect(Object.getPrototypeOf(result)).toBeNull();
  });

  it("keeps ordinary keys intact", () => {
    const result = mapToObject(
      new Map([
        ["a", 1],
        ["b", 2],
      ]),
    );
    expect(Object.keys(result)).toEqual(["a", "b"]);
    expect(result.a).toBe(1);
  });

  it("drops prototype-bearing keys while parsing JSON", () => {
    const parsed = safeJsonParse<Record<string, unknown>>(
      '{"ok":1,"__proto__":{"isAdmin":true},"constructor":{"c":1},"prototype":{"p":1}}',
      {},
    );

    expect(parsed.ok).toBe(1);
    // The old body checked only that Object.prototype was clean, which a
    // plain JSON.parse with no reviver also satisfies — the reviver itself
    // went unexercised. Assert the keys are actually gone, all three of them.
    expect(Object.getOwnPropertyNames(parsed)).toEqual(["ok"]);
    expect(({} as { isAdmin?: boolean }).isAdmin).toBeUndefined();
  });

  it("still falls back on malformed JSON", () => {
    expect(safeJsonParse("{not json", { fallback: true })).toEqual({
      fallback: true,
    });
  });
});

/* ─── TYP-02 / TYP-03 / TYP-04: randomness ────────────────────────────────── */

describe("randomness", () => {
  it("produces a valid v4 UUID from the secure generator", () => {
    expect(isUuidV4(systemRandom.uuid())).toBe(true);
  });

  it("stays within bounds and covers the range", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) {
      const value = systemRandom.int(7);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(7);
      seen.add(value);
    }
    expect(seen.size).toBe(7);
  });

  it("draws uniformly across a non-power-of-two bound", () => {
    const counts = new Array<number>(3).fill(0);
    const draws = 30_000;
    for (let i = 0; i < draws; i++) counts[systemRandom.int(3)]!++;

    for (const count of counts) {
      expect(Math.abs(count - draws / 3) / (draws / 3)).toBeLessThan(0.06);
    }
  });

  it("generates strings of the requested length", () => {
    expect(systemRandom.string(24)).toHaveLength(24);
    expect(systemRandom.custom(10, "ab")).toMatch(/^[ab]{10}$/);
    expect(systemRandom.string(0)).toBe("");
  });

  it("rejects invalid bounds", () => {
    expect(() => systemRandom.int(0)).toThrow(/positive integer/);
    expect(() => systemRandom.int(1.5)).toThrow(/positive integer/);
    expect(() => systemRandom.string(-1)).toThrow(/non-negative integer/);
    expect(() => systemRandom.custom(4, "")).toThrow(/must not be empty/);
  });

  it("keeps the deterministic generator out of the secure interface", () => {
    const seeded: PseudoRandom = new SeededRandom(1);
    expect(seeded.deterministic).toBe(true);

    // @ts-expect-error a PseudoRandom must not satisfy Random
    const asSecure: Random = seeded;
    expect(asSecure).toBeDefined();
  });

  it("produces a structurally valid UUID from the seeded generator", () => {
    const seeded = new SeededRandom(1);
    const value = seeded.uuid();

    expect(isUuidV4(value)).toBe(true);
    expect(isUuid(value)).toBe(true);
  });

  it("is reproducible from a seed", () => {
    expect(new SeededRandom(42).string(16)).toBe(
      new SeededRandom(42).string(16),
    );
    expect(new SeededRandom(42).string(16)).not.toBe(
      new SeededRandom(43).string(16),
    );
  });
});

/* ─── TYP-05 / TYP-06 / TYP-07: converters ────────────────────────────────── */

describe("converters", () => {
  it("always returns a string from toString", () => {
    expect(toString(() => 1)).toBe("");
    expect(toString(Symbol("x"))).toContain("Symbol");
    expect(toString(10n)).toBe("10");
    expect(toString({ a: 1 })).toBe('{"a":1}');
    expect(typeof toString(() => 1)).toBe("string");
  });

  it("falls back rather than treating NaN as true", () => {
    expect(toBoolean(Number.NaN)).toBe(false);
    expect(toBoolean(Number.NaN, true)).toBe(true);
    expect(toBoolean(1)).toBe(true);
    expect(toBoolean(0)).toBe(false);
  });

  it("recognises the usual boolean spellings", () => {
    expect(toBoolean("on")).toBe(true);
    expect(toBoolean("off")).toBe(false);
    expect(toBoolean("maybe")).toBe(false);
    expect(toBoolean("maybe", true)).toBe(true);
  });

  it("refuses blank, hexadecimal and infinite numbers", () => {
    expect(toNumber("", -1)).toBe(-1);
    expect(toNumber("   ", -1)).toBe(-1);
    expect(toNumber("0x10", -1)).toBe(-1);
    expect(toNumber("1e999", -1)).toBe(-1);
    expect(toNumber(Number.POSITIVE_INFINITY, -1)).toBe(-1);
  });

  it("still converts ordinary numbers", () => {
    expect(toNumber("42")).toBe(42);
    expect(toNumber("-1.5")).toBe(-1.5);
    expect(toNumber("1e3")).toBe(1000);
  });
});

/* ─── TYP-11: case conversion ─────────────────────────────────────────────── */

describe("case conversion", () => {
  it("does not emit a leading separator for PascalCase", () => {
    expect(camelToSnake("HelloWorld")).toBe("hello_world");
    expect(camelToKebab("HelloWorld")).toBe("hello-world");
  });

  it("keeps acronyms together", () => {
    expect(camelToSnake("parseHTTPResponse")).toBe("parse_http_response");
    expect(camelToKebab("parseHTTPResponse")).toBe("parse-http-response");
  });

  it("round-trips ordinary identifiers", () => {
    for (const value of ["userId", "createdAt", "isActive"]) {
      expect(snakeToCamel(camelToSnake(value))).toBe(value);
    }
  });
});

/* ─── TYP-10 / TYP-13: guards ─────────────────────────────────────────────── */

describe("guards", () => {
  it("separates a native Promise from a plain thenable", () => {
    const thenable = { then: (resolve: (v: unknown) => void) => resolve(1) };

    expect(isPromise(thenable)).toBe(false);
    expect(isThenable(thenable)).toBe(true);
    expect(isPromise(Promise.resolve())).toBe(true);
    expect(isThenable(Promise.resolve())).toBe(true);
  });

  it("excludes Infinity from the positive-number guard", () => {
    expect(isPositiveNumber(1)).toBe(true);
    expect(isPositiveNumber(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isPositiveNumber(Number.NaN)).toBe(false);
    expect(isFiniteNumber(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

/* ─── TYP-08 / TYP-09: shared acceptance set ──────────────────────────────── */

describe("shared acceptance set with @zudojs/validation", () => {
  it("accepts UUIDv7 and the nil UUID", () => {
    expect(isUuid("018f5e2a-1c3d-7abc-8def-0123456789ab")).toBe(true);
    expect(isUuid("00000000-0000-0000-0000-000000000000")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
  });

  it("distinguishes any-version from v4-only", () => {
    expect(isUuidV4("018f5e2a-1c3d-7abc-8def-0123456789ab")).toBe(false);
    expect(isUuidV4("f47ac10b-58cc-4372-a567-0e02b2c3d479")).toBe(true);
  });

  it("agrees with the validation package on emails", () => {
    expect(isEmail("user@example.com")).toBe(true);
    expect(isEmail("a@b..c")).toBe(false);
    expect(isEmail("a@b")).toBe(false);
    expect(isEmail("a b@example.com")).toBe(false);
  });

  it("agrees with the validation package on ISO dates", () => {
    expect(isIsoDateString("2024-01-31")).toBe(true);
    expect(isIsoDateString("2024-01-01T00:00:00+02:00")).toBe(true);
    expect(isIsoDateString("2024-02-31")).toBe(false);
    expect(isIsoDateString("2024-13-45T99:99:99Z")).toBe(false);
  });

  it("requires a time component only from the date-time guard", () => {
    expect(isIsoDateString("2024-01-01")).toBe(true);
    expect(isIsoDateTimeString("2024-01-01")).toBe(false);
    expect(isIsoDateTimeString("2024-01-01T10:30:00Z")).toBe(true);
  });
});
