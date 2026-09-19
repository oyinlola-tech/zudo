/**
 * Round 10 regressions for @zudojs/constants.
 */

import { describe, expect, it } from "vitest";
import * as sharedErrors from "@zudojs/errors";

import {
  InvalidConstantError,
  ConstantContextError,
  SCHEMA_FORBIDDEN_KEYS,
  ValidationPattern,
  createEmailAddress,
  createMockRandom,
  createTenantId,
  createTimestamp,
  systemRandom,
  type Random,
} from "../src/index.js";

describe("LEAF-04", () => {
  const cases: readonly [string, boolean][] = [
    ["a..b@example.com", false],
    ["user@host.123", true],
    ["o'brien@example.com", true],
    ["a@b.c", true],
    ["plain@example.com", true],
    ["no-at-sign", false],
    ["sp ace@example.com", false],
    [`${"a".repeat(250)}@b.co`, false],
  ];
  it.each(cases)("%s -> %s (same set as @zudojs/types isEmail)", (value, ok) => {
    expect(ValidationPattern.EMAIL.test(value)).toBe(ok);
    if (ok) expect(createEmailAddress(value)).toBe(value);
    else expect(() => createEmailAddress(value)).toThrow(InvalidConstantError);
  });

  it("stays linear on a long hostile domain", () => {
    const start = performance.now();
    ValidationPattern.EMAIL.test(`a@${"a-".repeat(50_000)}!`);
    expect(performance.now() - start).toBeLessThan(200);
  });
});

describe("LEAF-05", () => {
  it("does not accept the seeded mock where a secure Random is required", () => {
    // @ts-expect-error MockRandom lacks the security brand.
    const bad: Random = createMockRandom(1);
    expect(bad.random()).toBeTypeOf("number");
    expect(createMockRandom(1).deterministic).toBe(true);
    const good: Random = systemRandom;
    expect(good.randomString(8)).toHaveLength(8);
  });
});

describe("LEAF-06", () => {
  it.each([
    "2024-02-30T00:00:00Z",
    "2023-02-29T12:00:00Z",
    "2024-04-31T00:00:00Z",
    "2024-01-01T24:00:00Z",
    "2024-01-01T00:60:00Z",
    "2024-01-01T00:00:00+24:00",
  ])("rejects %s", (iso) => {
    expect(() => createTimestamp(iso)).toThrow(InvalidConstantError);
  });

  it("accepts real instants", () => {
    expect(createTimestamp("2024-02-29T23:59:59.999Z")).toBe(
      "2024-02-29T23:59:59.999Z",
    );
    expect(createTimestamp("2024-01-01T00:00:00+05:30")).toBeTruthy();
  });
});

describe("LEAF-12", () => {
  it("cannot be emptied through Set.prototype methods", () => {
    expect(() => Set.prototype.clear.call(SCHEMA_FORBIDDEN_KEYS)).toThrow(
      TypeError,
    );
    expect(() =>
      Set.prototype.delete.call(SCHEMA_FORBIDDEN_KEYS, "__proto__"),
    ).toThrow(TypeError);
    expect(SCHEMA_FORBIDDEN_KEYS.has("__proto__")).toBe(true);
    expect(() => (SCHEMA_FORBIDDEN_KEYS as Set<string>).clear()).toThrow(
      TypeError,
    );
    expect([...SCHEMA_FORBIDDEN_KEYS]).toContain("constructor");
  });
});

describe("X-05", () => {
  it("validates and normalizes tenant ids like @zudojs/tenancy", () => {
    expect(createTenantId(" Tenant-A ")).toBe("tenant-a");
    for (const bad of ["../../etc|x:y", "Tenant A\n", "", "-x", "a".repeat(65)]) {
      expect(() => createTenantId(bad)).toThrow(InvalidConstantError);
    }
  });
});

describe("CV-02 (constants)", () => {
  it("re-exports the @zudojs/errors classes", () => {
    expect(InvalidConstantError).toBe(sharedErrors.InvalidConstantError);
    expect(ConstantContextError).toBe(sharedErrors.ConstantContextError);
  });
});
