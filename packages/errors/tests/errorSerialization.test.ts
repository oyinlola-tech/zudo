import { describe, it, expect } from "vitest";
import {
  BaseError,
  ApplicationError,
  NotFoundError,
  ValidationError,
  ErrorCode,
} from "../src/index.js";

describe("Error Serialization", () => {
  describe("BaseError.toJSON", () => {
    it("should serialize all required fields", () => {
      const error = new BaseError("test", {
        code: ErrorCode.VALIDATION_FAILED,
        statusCode: 400,
      });

      const json = error.toJSON();

      expect(json.name).toBe("BaseError");
      expect(json.message).toBe("test");
      expect(json.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(json.statusCode).toBe(400);
      expect(typeof json.category).toBe("string");
      expect(typeof json.severity).toBe("string");
      expect(typeof json.expose).toBe("boolean");
      expect(typeof json.isOperational).toBe("boolean");
      expect(typeof json.metadata).toBe("object");
    });

    it("toJSON includes the stack for trusted logging", () => {
      const error = new BaseError("test");
      const json = error.toJSON();

      expect(json).toHaveProperty("stack");
    });
  });

  describe("ApplicationError.toJSON", () => {
    it("should serialize application error", () => {
      const error = new ApplicationError("app error", {
        code: ErrorCode.INTERNAL_ERROR,
      });

      const json = error.toJSON();

      expect(json).toHaveProperty("name", "ApplicationError");
      expect(json).toHaveProperty("message", "app error");
    });
  });

  describe("NotFoundError.toJSON", () => {
    it("should serialize not found error", () => {
      const error = new NotFoundError("resource not found");

      const json = error.toJSON();

      expect(json).toHaveProperty("name", "NotFoundError");
      expect(json).toHaveProperty("statusCode", 404);
    });
  });

  describe("ValidationError.toJSON", () => {
    it("should serialize validation error with issues", () => {
      const error = new ValidationError("validation failed", {
        issues: [{ message: "required", path: ["name"] }],
      });

      const json = error.toJSON();

      expect(json).toHaveProperty("name", "ValidationError");
      expect(json).toHaveProperty("statusCode", 400);
    });
  });

  describe("Error cause chaining", () => {
    it("should preserve cause in serialization", () => {
      const cause = new Error("root cause");
      const error = new BaseError("wrapped", { cause });

      const json = error.toJSON();

      expect(json).toHaveProperty("cause");
    });
  });
});
