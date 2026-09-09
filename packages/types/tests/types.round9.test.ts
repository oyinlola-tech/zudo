/**
 * Round-9 audit regression tests.
 *
 * Two classes of gap: exports that were public, documented and completely
 * untested (`toArray`, `objectToMap`, `kebabToCamel`, and every one of the 18
 * utility types), and a ReDoS-shaped pattern applied to unbounded input.
 */

import { describe, it, expect, expectTypeOf } from "vitest";

import {
  isEmail,
  isIsoDateString,
  MAX_EMAIL_LENGTH,
  toArray,
  objectToMap,
  mapToObject,
  kebabToCamel,
  camelToKebab,
  snakeToCamel,
  camelToSnake,
  systemClockSeconds,
  systemClock,
} from "../src/index.js";
import type {
  DeepReadonly,
  DeepPartial,
  DeepRequired,
  Prettify,
  StringKeysOf,
  NumberKeysOf,
  PartialExcept,
  RequiredExcept,
  PartialKeys,
  OptionalKeyNames,
  RequireKeys,
  AsyncReturnType,
  Nullable,
  Undefinable,
  Maybe,
  MaybePromise,
  NestedKeyOf,
  NestedValueOf,
  OmitByValue,
  PickByValue,
} from "../src/index.js";

/* ─── TYP9-01: isEmail bounds its input before matching ──────────────────── */

describe("TYP9-01: isEmail cannot be handed unbounded input", () => {
  it("refuses an over-length address instead of matching it", () => {
    expect(MAX_EMAIL_LENGTH).toBe(254);
    const overLong = `${"a".repeat(MAX_EMAIL_LENGTH)}@example.com`;
    expect(isEmail(overLong)).toBe(false);
  });

  it("returns promptly on the catastrophic-backtracking shape", () => {
    // Local half is a negated class (linear); the domain half carries the
    // ambiguous quantifier. This is the payload that used to make the domain
    // pattern grind: many hyphen-and-alnum labels with no terminating match.
    const hostile = `a@${"a-".repeat(40_000)}`;
    const started = Date.now();
    expect(isEmail(hostile)).toBe(false);
    expect(Date.now() - started).toBeLessThan(200);
  });

  it("still accepts ordinary addresses", () => {
    expect(isEmail("user.name+tag@sub.example.co.uk")).toBe(true);
    expect(isEmail("a@b.co")).toBe(true);
    expect(isEmail("a@@b.co")).toBe(false);
    expect(isEmail("a@b..co")).toBe(false);
  });
});

/* ─── TYP9-02: isIsoDateString uses guards, not assertions ───────────────── */

describe("TYP9-02: isIsoDateString", () => {
  it("validates the calendar, not just the digit count", () => {
    expect(isIsoDateString("2024-02-29")).toBe(true); // leap year
    expect(isIsoDateString("2023-02-29")).toBe(false);
    expect(isIsoDateString("2024-13-45T99:99:99Z")).toBe(false);
    expect(isIsoDateString("2024-01-01T00:00:00+02:00")).toBe(true);
  });

  it("rejects rather than propagating NaN through Date.UTC", () => {
    expect(isIsoDateString("aaaa-bb-cc")).toBe(false);
    expect(isIsoDateString("")).toBe(false);
  });
});

/* ─── TYP9-03: converters that had zero tests ────────────────────────────── */

describe("TYP9-03: previously untested converters", () => {
  it("toArray wraps a non-array and passes an array through by identity", () => {
    expect(toArray(1)).toEqual([1]);
    expect(toArray(undefined)).toEqual([undefined]);
    const existing = [1, 2];
    expect(toArray(existing)).toBe(existing);
  });

  it("objectToMap round-trips with mapToObject", () => {
    const map = new Map<string, number>([
      ["a", 1],
      ["b", 2],
    ]);
    expect([...objectToMap(mapToObject(map))]).toEqual([...map]);
  });

  it("objectToMap keeps a hostile key as a Map key, where it is inert", () => {
    const hostile = JSON.parse('{"__proto__":{"x":1},"ok":1}') as Record<
      string,
      unknown
    >;
    const map = objectToMap(hostile);
    // A Map key cannot reach a prototype, so the key is carried rather than
    // dropped — and nothing is polluted.
    expect(map.get("ok")).toBe(1);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });

  it("kebabToCamel is the inverse of camelToKebab for simple identifiers", () => {
    expect(kebabToCamel("content-type")).toBe("contentType");
    expect(kebabToCamel("x-request-id")).toBe("xRequestId");
    expect(kebabToCamel("already")).toBe("already");
    expect(kebabToCamel("a--b")).toBe("aB");
    expect(camelToKebab(kebabToCamel("content-type"))).toBe("content-type");
    expect(snakeToCamel(camelToSnake("parseHTTPResponse"))).toBe(
      "parseHttpResponse",
    );
  });
});

/* ─── TYP9-04: the runtime clock pair ────────────────────────────────────── */

describe("TYP9-04: systemClockSeconds", () => {
  it("reports whole seconds matching systemClock's milliseconds", () => {
    const seconds = systemClockSeconds.nowSeconds();
    const millis = systemClock.now();
    expect(Number.isInteger(seconds)).toBe(true);
    expect(Math.abs(seconds - Math.floor(millis / 1000))).toBeLessThanOrEqual(
      1,
    );
  });
});

/* ─── TYP9-05: the utility types, none of which had a single test ────────── */

interface Sample {
  readonly id: string;
  count: number;
  nested: { deep: { flag: boolean } };
  optional?: string;
  handler: () => void;
}

describe("TYP9-05: utility types are instantiable and mean what they say", () => {
  it("DeepReadonly / DeepPartial / DeepRequired reach nested levels", () => {
    expectTypeOf<DeepReadonly<Sample>["nested"]["deep"]["flag"]>().toEqualTypeOf<boolean>();
    const partial: DeepPartial<Sample> = { nested: { deep: {} } };
    expect(partial.nested?.deep).toEqual({});
    expectTypeOf<
      DeepRequired<{ a?: { b?: number } }>["a"]["b"]
    >().toEqualTypeOf<number>();
  });

  it("Prettify preserves the members of an intersection", () => {
    expectTypeOf<Prettify<{ a: 1 } & { b: 2 }>>().toEqualTypeOf<{
      a: 1;
      b: 2;
    }>();
  });

  it("StringKeysOf and NumberKeysOf select by key kind", () => {
    expectTypeOf<StringKeysOf<{ a: 1; 2: 3 }>>().toEqualTypeOf<"a">();
    expectTypeOf<NumberKeysOf<{ a: 1; 2: 3 }>>().toEqualTypeOf<2>();
  });

  it("PartialExcept and RequiredExcept invert each other's exception", () => {
    const value: PartialExcept<{ a: number; b: number }, "a"> = { a: 1 };
    expect(value.a).toBe(1);
    expectTypeOf<
      RequiredExcept<{ a?: number; b?: number }, "b">["a"]
    >().toEqualTypeOf<number>();
  });

  it("OptionalKeyNames names only the optional members", () => {
    expectTypeOf<OptionalKeyNames<Sample>>().toEqualTypeOf<"optional">();
  });

  it("PartialKeys makes the named members optional", () => {
    const value: PartialKeys<{ a: number; b: number }, "b"> = { a: 1 };
    expect(value.a).toBe(1);
    expectTypeOf<OptionalKeyNames<PartialKeys<{ a: number; b: number }, "b">>>()
      .toEqualTypeOf<"b">();
  });

  it("RequireKeys promotes the named members", () => {
    expectTypeOf<
      RequireKeys<{ a?: number; b?: number }, "a">["a"]
    >().toEqualTypeOf<number>();
  });

  it("AsyncReturnType accepts a real async function", () => {
    // The constraint used to be `(...args: unknown[]) => Promise<unknown>`,
    // which — parameters being contravariant — rejected every function with
    // concrete parameters. This line would not have compiled.
    const fetchUser = async (id: string): Promise<{ id: string }> => ({ id });
    expectTypeOf<AsyncReturnType<typeof fetchUser>>().toEqualTypeOf<{
      id: string;
    }>();
    expectTypeOf<
      AsyncReturnType<() => Promise<number>>
    >().toEqualTypeOf<number>();
  });

  it("Nullable / Undefinable / Maybe / MaybePromise widen as documented", () => {
    expectTypeOf<Nullable<string>>().toEqualTypeOf<string | null>();
    expectTypeOf<Undefinable<string>>().toEqualTypeOf<string | undefined>();
    expectTypeOf<Maybe<string>>().toEqualTypeOf<string | null | undefined>();
    expectTypeOf<MaybePromise<string>>().toEqualTypeOf<
      string | Promise<string>
    >();
  });

  it("NestedKeyOf and NestedValueOf walk a dotted path", () => {
    const path: NestedKeyOf<Sample> = "nested.deep.flag";
    expect(path).toBe("nested.deep.flag");
    expectTypeOf<
      NestedValueOf<Sample, "nested.deep.flag">
    >().toEqualTypeOf<boolean>();
  });

  it("OmitByValue and PickByValue filter on the value type", () => {
    expectTypeOf<
      keyof OmitByValue<{ a: string; b: number }, number>
    >().toEqualTypeOf<"a">();
    expectTypeOf<
      keyof PickByValue<{ a: string; b: number }, number>
    >().toEqualTypeOf<"b">();
  });
});
