import { describe, it, expect } from "vitest";
import {
  BaseError,
  ErrorCode,
  ErrorCategory,
} from "../src/index.js";
import {
  isErrorLike,
  isOperationalError,
  isExposableError,
  isServerError,
  isClientError,
  hasErrorCategory,
  hasErrorSeverity,
  normalizeError,
  isHandledError,
  createErrorHandler,
} from "../src/index.js";

class NotFound extends BaseError {
  constructor() {
    super("missing", {
      statusCode: 404,
      code: ErrorCode.NOT_FOUND,
      category: ErrorCategory.RESOURCE,
    });
  }
}

class Internal extends BaseError {
  constructor() {
    super("oops", { statusCode: 500, code: ErrorCode.INTERNAL_ERROR });
  }
}

describe("Error utilities", () => {
  describe("isErrorLike", () => {
    it("matches objects with a string message", () => {
      expect(isErrorLike(new Error("x"))).toBe(true);
      expect(isErrorLike({ message: "x" })).toBe(true);
    });
    it("rejects non-objects and missing message", () => {
      expect(isErrorLike(null)).toBe(false);
      expect(isErrorLike("error")).toBe(false);
      expect(isErrorLike({})).toBe(false);
      expect(isErrorLike({ message: 42 })).toBe(false);
    });
  });

  describe("isOperationalError", () => {
    it("returns true for BaseError with isOperational=true", () => {
      expect(isOperationalError(new NotFound())).toBe(true);
    });
    it("returns false for plain errors", () => {
      expect(isOperationalError(new Error("x"))).toBe(false);
    });
  });

  describe("isExposableError", () => {
    it("exposes 4xx errors by default", () => {
      expect(isExposableError(new NotFound())).toBe(true);
      expect(isExposableError(new Internal())).toBe(false);
    });
  });

  describe("isServerError / isClientError", () => {
    it("classifies 5xx as server", () => {
      expect(isServerError(new Internal())).toBe(true);
    });
    it("classifies 4xx as client", () => {
      expect(isClientError(new NotFound())).toBe(true);
      expect(isClientError(new Internal())).toBe(false);
    });
  });

  describe("hasErrorCategory / hasErrorSeverity", () => {
    it("matches by category", () => {
      const err = new NotFound();
      expect(hasErrorCategory(err, ErrorCategory.RESOURCE)).toBe(true);
      expect(hasErrorCategory(err, ErrorCategory.VALIDATION)).toBe(false);
    });
    it("matches by severity", () => {
      const err = new NotFound();
      expect(hasErrorSeverity(err, err.severity)).toBe(true);
    });
  });

  describe("normalizeError", () => {
    it("passes through BaseError", () => {
      const err = new NotFound();
      expect(normalizeError(err)).toBe(err);
    });
    it("wraps plain errors into a BaseError with the same message", () => {
      const wrapped = normalizeError(new Error("boom"));
      expect(wrapped).toBeInstanceOf(BaseError);
      expect(wrapped.message).toBe("boom");
    });
    it("wraps strings", () => {
      const wrapped = normalizeError("plain");
      expect(wrapped).toBeInstanceOf(BaseError);
      expect(wrapped.message).toBe("plain");
    });
    it("wraps nullish values", () => {
      const wrapped = normalizeError(null);
      expect(wrapped).toBeInstanceOf(BaseError);
    });
  });

  describe("isHandledError", () => {
    it("returns true for BaseError", () => {
      expect(isHandledError(new NotFound())).toBe(true);
    });
    it("returns false for plain Error", () => {
      expect(isHandledError(new Error("x"))).toBe(false);
    });
  });

  describe("createErrorHandler", () => {
    it("returns an ErrorHandler that normalizes unknown values", () => {
      const handler = createErrorHandler();
      const result = handler.normalize(new Error("test"));
      expect(result.error).toBeInstanceOf(BaseError);
    });
  });
});
