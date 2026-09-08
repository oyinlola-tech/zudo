import { describe, it, expect } from "vitest";
import {
  BaseError,
  ErrorCode,
  ErrorCategory,
  ErrorSeverity,
} from "../src/index.js";

class TestError extends BaseError {}

class HttpNotFoundError extends BaseError {
  constructor(message: string) {
    super(message, {
      code: ErrorCode.NOT_FOUND,
      category: ErrorCategory.RESOURCE,
      severity: ErrorSeverity.WARNING,
      statusCode: 404,
    });
  }
}

describe("BaseError", () => {
  describe("construction", () => {
    it("creates an error with sensible defaults", () => {
      const err = new TestError("boom");
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(BaseError);
      expect(err.message).toBe("boom");
      expect(err.name).toBe("TestError");
      expect(err.code).toBe(ErrorCode.UNKNOWN);
      expect(err.category).toBe(ErrorCategory.UNKNOWN);
      expect(err.severity).toBe(ErrorSeverity.ERROR);
      expect(err.statusCode).toBe(500);
      expect(err.isOperational).toBe(true);
    });

    it("uses provided options", () => {
      const cause = new Error("inner");
      const err = new TestError("boom", {
        code: "CUSTOM_CODE",
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.WARNING,
        statusCode: 422,
        cause,
        metadata: { foo: "bar" },
      });
      expect(err.code).toBe("CUSTOM_CODE");
      expect(err.category).toBe(ErrorCategory.VALIDATION);
      expect(err.severity).toBe(ErrorSeverity.WARNING);
      expect(err.statusCode).toBe(422);
      expect(err.cause).toBe(cause);
      expect(err.metadata).toEqual({ foo: "bar" });
    });

    it("throws on out-of-range status codes", () => {
      expect(() => new TestError("x", { statusCode: 1000 })).toThrow(
        RangeError,
      );
    });

    it("throws on non-integer status codes", () => {
      expect(() => new TestError("x", { statusCode: 200.5 })).toThrow(
        RangeError,
      );
    });

    it("preserves the prototype chain", () => {
      const err = new TestError("x");
      expect(Object.getPrototypeOf(err)).toBe(TestError.prototype);
      expect(err instanceof TestError).toBe(true);
    });
  });

  describe("withMetadata", () => {
    it("returns a new error with merged metadata", () => {
      const original = new TestError("a", { metadata: { x: 1 } });
      const next = original.withMetadata({ y: 2 });
      expect(next).not.toBe(original);
      expect(next.getMetadata("x")).toBe(1);
      expect(next.getMetadata("y")).toBe(2);
      expect(original.getMetadata("y")).toBeUndefined();
    });

    it("preserves code, category, severity, statusCode", () => {
      const original = new HttpNotFoundError("missing");
      const next = original.withMetadata({ req: "r1" });
      expect(next.code).toBe(original.code);
      expect(next.statusCode).toBe(original.statusCode);
    });
  });

  describe("toJSON", () => {
    it("produces a serializable representation", () => {
      const err = new TestError("boom", { metadata: { a: 1 } });
      const json = err.toJSON();
      expect(json.name).toBe("TestError");
      expect(json.message).toBe("boom");
      expect(json.code).toBe(ErrorCode.UNKNOWN);
      expect(json.metadata).toEqual({ a: 1 });
      expect(typeof json.stack).toBe("string");
    });

    it("serializes the cause if present", () => {
      const cause = new Error("inner");
      const err = new TestError("outer", { cause });
      const json = err.toJSON();
      expect(json.cause).toEqual({
        name: "Error",
        message: "inner",
        stack: expect.any(String),
      });
    });
  });
});
