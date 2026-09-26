/**
 * Round 12 regressions for @zudojs/validation (academy findings #57, #58, #59).
 */

import { Buffer } from "node:buffer";

import { ConfigurationError, SerializationPayloadTooLargeError } from "@zudojs/errors";
import { describe, expect, it } from "vitest";

import {
  ValidationErrorCode,
  assertSizeWithinLimit,
  combineConstraints,
  createValidationError,
  createValidationRegistry,
  email,
  estimateSerializedSize,
  everyItem,
  formatIssues,
  isValid,
  issue,
  letters,
  minLength,
  not,
  oneOf,
  validate,
  validateAsync,
  z,
} from "../src/index.js";

const wireBytes = (value: unknown): number =>
  Buffer.byteLength(JSON.stringify(value), "utf8");

describe("#57 estimateSerializedSize counts UTF-8 bytes", () => {
  it("does not undercount non-ASCII strings", () => {
    const naira = "₦".repeat(1000);
    expect(wireBytes(naira)).toBe(3002);
    expect(estimateSerializedSize(naira)).toBeGreaterThanOrEqual(3002);
  });

  it.each([
    "₦".repeat(1000),
    { amount: "₦5,000", note: "naïve 🛒" },
    { "ключ": ["значение", "\u0001", "quote\""] },
    ["🛒", "混合", "plain"],
  ])("stays at or above the wire size for %j", (value) => {
    expect(estimateSerializedSize(value)).toBeGreaterThanOrEqual(wireBytes(value));
  });

  it("assertSizeWithinLimit rejects a payload that really exceeds the limit", () => {
    const naira = "₦".repeat(1000);
    expect(() => assertSizeWithinLimit(naira, 3000)).toThrow(
      SerializationPayloadTooLargeError,
    );
    expect(() => assertSizeWithinLimit(naira, 3100)).not.toThrow();
  });
});

describe("#58 async refinements in a synchronous parse", () => {
  const asyncSchema = z.string().refine(async (v) => v.length > 0, "empty");

  it("validate() throws a ConfigurationError naming the fix", () => {
    expect(() => validate(asyncSchema, "x")).toThrow(ConfigurationError);
    expect(() => validate(asyncSchema, "x")).toThrow(/validateAsync/);
  });

  it("isValid() throws the same error", () => {
    expect(() => isValid(asyncSchema, "x")).toThrow(ConfigurationError);
  });

  it("validateAsync() handles the schema", async () => {
    await expect(validateAsync(asyncSchema, "x")).resolves.toMatchObject({
      success: true,
      data: "x",
    });
  });

  it("does not confuse a defect in a sync refine with an async schema", () => {
    const throwing = z.string().refine(() => {
      throw new TypeError("boom");
    });
    expect(() => validate(throwing, "x")).toThrow(TypeError);
  });
});

describe("#59 rough edges", () => {
  it("registry misuse throws ConfigurationError", () => {
    const registry = createValidationRegistry();
    expect(() => registry.validate("missing", 1)).toThrow(ConfigurationError);
    expect(() => registry.require("missing")).toThrow(/is not registered/);
    registry.registerSchema("x", z.string());
    expect(() => registry.registerSchema("x", z.number())).toThrow(ConfigurationError);
    expect(() => registry.registerSchema("x", z.number())).toThrow(/already registered/);
    expect(() => registry.register({ name: "   ", schema: z.string() })).toThrow(
      ConfigurationError,
    );
  });

  it("createValidationError is INVALID_INPUT, not UNKNOWN", () => {
    const error = createValidationError([issue("bad", { path: ["a"] })]);
    expect(error.validationCode).toBe(ValidationErrorCode.INVALID_INPUT);
    expect(
      createValidationError([issue("bad")], { code: ValidationErrorCode.REQUIRED })
        .validationCode,
    ).toBe(ValidationErrorCode.REQUIRED);
  });

  it("not() speaks in words, not internal names", () => {
    expect(not(oneOf(["a", "b"])).message).toBe(
      'Value must not satisfy the "one of" constraint.',
    );
    expect(not(minLength(3)).message).toBe(
      'Value must not satisfy the "min length 3" constraint.',
    );
    expect(not(oneOf(["a"]), { message: "no" }).message).toBe("no");
  });

  it("combineConstraints lists what was required", () => {
    const combined = combineConstraints(minLength(3), letters);
    expect(combined.message).toBe(
      "Value must contain at least 3 characters. Value must contain only letters.",
    );
    expect(combined.validate("abc")).toBe(true);
    expect(combined.validate("ab1")).toBe(false);
  });

  it("everyItem says it is about the items", () => {
    const every = everyItem(email);
    expect(every.message).toBe(
      "Every item must satisfy: Value must be a valid email address.",
    );
    expect(every.validate(42 as never)).toBe(false);
    expect(every.validate(["a@b.co"])).toBe(true);
  });

  it("formatIssues omits the colon for path-less issues", () => {
    expect(formatIssues([issue("Whole value is wrong")])).toBe("Whole value is wrong");
    expect(formatIssues([issue("bad", { path: ["a", 0] }), issue("worse")])).toBe(
      "a.0: bad; worse",
    );
  });
});
