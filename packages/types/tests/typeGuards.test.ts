import { describe, it, expect } from "vitest";

import {
  isPlainObject,
  isNonNullObject,
  isNonEmptyString,
  isPositiveNumber,
  isInteger,
  isDate,
  isUrl,
  isEmail,
  isUuid,
  isIsoDateString,
  isIsoDateTimeString,
  isArrayOfType,
  isDefined,
  isFunction,
  isPromise,
} from "../src/typeGuards/typeGuards.core.js";

describe("TypeGuards", () => {
  describe("isPlainObject", () => {
    it("should return true for plain objects", () => {
      expect(isPlainObject({})).toBe(true);
      expect(isPlainObject({ a: 1, b: 2 })).toBe(true);
    });

    it("should return false for non-plain objects", () => {
      expect(isPlainObject(null)).toBe(false);
      expect(isPlainObject(undefined)).toBe(false);
      expect(isPlainObject([])).toBe(false);
      expect(isPlainObject("string")).toBe(false);
      expect(isPlainObject(123)).toBe(false);
      expect(isPlainObject(new Date())).toBe(false);
    });
  });

  describe("isNonNullObject", () => {
    it("should return true for non-null objects", () => {
      expect(isNonNullObject({})).toBe(true);
      expect(isNonNullObject([])).toBe(true);
      expect(isNonNullObject(new Date())).toBe(true);
    });

    it("should return false for null or non-objects", () => {
      expect(isNonNullObject(null)).toBe(false);
      expect(isNonNullObject(undefined)).toBe(false);
      expect(isNonNullObject("string")).toBe(false);
      expect(isNonNullObject(123)).toBe(false);
    });
  });

  describe("isNonEmptyString", () => {
    it("should return true for non-empty strings", () => {
      expect(isNonEmptyString("hello")).toBe(true);
      expect(isNonEmptyString(" ")).toBe(true);
    });

    it("should return false for empty strings or non-strings", () => {
      expect(isNonEmptyString("")).toBe(false);
      expect(isNonEmptyString(null)).toBe(false);
      expect(isNonEmptyString(123)).toBe(false);
    });
  });

  describe("isPositiveNumber", () => {
    it("should return true for positive numbers", () => {
      expect(isPositiveNumber(1)).toBe(true);
      expect(isPositiveNumber(0.5)).toBe(true);
      expect(isPositiveNumber(100)).toBe(true);
    });

    it("should return false for non-positive numbers", () => {
      expect(isPositiveNumber(0)).toBe(false);
      expect(isPositiveNumber(-1)).toBe(false);
      expect(isPositiveNumber(NaN)).toBe(false);
      expect(isPositiveNumber("string")).toBe(false);
    });
  });

  describe("isInteger", () => {
    it("should return true for integers", () => {
      expect(isInteger(0)).toBe(true);
      expect(isInteger(1)).toBe(true);
      expect(isInteger(-1)).toBe(true);
      expect(isInteger(100)).toBe(true);
    });

    it("should return false for non-integers", () => {
      expect(isInteger(0.5)).toBe(false);
      expect(isInteger(1.5)).toBe(false);
      expect(isInteger(NaN)).toBe(false);
      expect(isInteger("string")).toBe(false);
    });
  });

  describe("isDate", () => {
    it("should return true for valid Date objects", () => {
      expect(isDate(new Date())).toBe(true);
      expect(isDate(new Date("2024-01-01"))).toBe(true);
    });

    it("should return false for invalid Date objects", () => {
      expect(isDate(new Date("invalid"))).toBe(false);
      expect(isDate(null)).toBe(false);
      expect(isDate("2024-01-01")).toBe(false);
    });
  });

  describe("isUrl", () => {
    it("should return true for valid URLs", () => {
      expect(isUrl("https://example.com")).toBe(true);
      expect(isUrl("http://localhost:3000")).toBe(true);
    });

    it("should return false for invalid URLs", () => {
      expect(isUrl("not-a-url")).toBe(false);
      expect(isUrl("ftp://example.com")).toBe(false);
      expect(isUrl(null)).toBe(false);
    });
  });

  describe("isEmail", () => {
    it("should return true for valid emails", () => {
      expect(isEmail("user@example.com")).toBe(true);
      expect(isEmail("test.email@domain.co")).toBe(true);
    });

    it("should return false for invalid emails", () => {
      expect(isEmail("not-an-email")).toBe(false);
      expect(isEmail("@domain.com")).toBe(false);
      expect(isEmail(null)).toBe(false);
    });
  });

  describe("isUuid", () => {
    it("should return true for valid UUIDs", () => {
      expect(isUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    });

    it("should return false for invalid UUIDs", () => {
      expect(isUuid("not-a-uuid")).toBe(false);
      expect(isUuid("550e8400-e29b-41d4-a716")).toBe(false);
      expect(isUuid(null)).toBe(false);
    });
  });

  describe("isIsoDateString", () => {
    it("should return true for valid ISO date strings", () => {
      expect(isIsoDateString("2024-01-01T00:00:00Z")).toBe(true);
      expect(isIsoDateString("2024-01-01T12:30:45.123Z")).toBe(true);
    });

    it("accepts a date-only ISO string", () => {
      expect(isIsoDateString("2024-01-01")).toBe(true);
      expect(isIsoDateTimeString("2024-01-01")).toBe(false);
    });

    it("should return false for invalid ISO date strings", () => {
      expect(isIsoDateString("not-a-date")).toBe(false);
      expect(isIsoDateString(null)).toBe(false);
    });
  });

  describe("isArrayOfType", () => {
    it("should return true for arrays of the correct type", () => {
      expect(isArrayOfType([1, 2, 3], isInteger)).toBe(true);
      expect(isArrayOfType(["a", "b", "c"], isNonEmptyString)).toBe(true);
    });

    it("should return false for arrays of the wrong type", () => {
      expect(isArrayOfType([1, "two", 3], isInteger)).toBe(false);
      expect(isArrayOfType([], isInteger)).toBe(true);
    });

    it("should return false for non-arrays", () => {
      expect(isArrayOfType("not-an-array", isInteger)).toBe(false);
    });
  });

  describe("isDefined", () => {
    it("should return true for defined values", () => {
      expect(isDefined(0)).toBe(true);
      expect(isDefined("")).toBe(true);
      expect(isDefined(false)).toBe(true);
    });

    it("should return false for undefined or null", () => {
      expect(isDefined(undefined)).toBe(false);
      expect(isDefined(null)).toBe(false);
    });
  });

  describe("isFunction", () => {
    it("should return true for functions", () => {
      expect(isFunction(() => {})).toBe(true);
      expect(isFunction(function () {})).toBe(true);
    });

    it("should return false for non-functions", () => {
      expect(isFunction(null)).toBe(false);
      expect(isFunction("string")).toBe(false);
      expect(isFunction(123)).toBe(false);
    });
  });

  describe("isPromise", () => {
    it("should return true for promises", () => {
      expect(isPromise(Promise.resolve())).toBe(true);
      expect(isPromise(new Promise(() => {}))).toBe(true);
    });

    it("should return false for non-promises", () => {
      expect(isPromise(null)).toBe(false);
      expect(isPromise({})).toBe(false);
      expect(isPromise("string")).toBe(false);
    });
  });
});
