import { describe, it, expect } from "vitest";
import { z } from "zod";

import {
  success,
  failure,
  issue,
  isValidationSuccess,
  isValidationFailure,
  formatIssues,
  toFieldErrors,
  unwrapValidation,
  map,
  combine,
} from "../src/validationResult/validationResult.type.js";

import {
  ValidationError,
  ValidationErrorCode,
  isValidationError,
  toValidationError,
} from "../src/validationErrors/validationError.base.js";

import {
  SchemaValidationError,
  ConstraintValidationError,
} from "../src/validationErrors/validationError.types.js";

import {
  validate,
  parse,
  validateAsync,
  parseAsync,
  mapZodIssues,
  assertValid,
} from "../src/validationSchema/validationSchema.core.js";

import {
  createValidationParser,
  createAsyncValidationParser,
} from "../src/validationParser/index.js";

import {
  createValidationTransformer,
  validateAndTransform,
} from "../src/validationTransformer/index.js";

import { createValidationRegistry } from "../src/validationRegistry/validationRegistry.core.js";

import {
  composeSchemas,
  all,
  schemaStep,
  constraintStep,
} from "../src/validationComposer/index.js";

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

describe("ValidationResult", () => {
  it("creates a success result", () => {
    const result = success("hello");
    expect(result.success).toBe(true);
    expect(result.data).toBe("hello");
    expect(result.issues).toHaveLength(0);
  });

  it("creates a failure result", () => {
    const err = issue("required");
    const result = failure([err]);
    expect(result.success).toBe(false);
    expect(result.data).toBeUndefined();
    expect(result.issues).toHaveLength(1);
  });

  it("rejects empty failure", () => {
    expect(() => failure([])).toThrow("at least one issue");
  });

  it("creates an issue with defaults", () => {
    const i = issue("bad");
    expect(i.message).toBe("bad");
    expect(i.path).toEqual([]);
    expect(i.code).toBeTruthy();
  });

  it("creates an issue with options", () => {
    const i = issue("bad", {
      path: ["user", "name"],
      code: "REQUIRED",
      expected: "string",
      received: 42,
    });
    expect(i.path).toEqual(["user", "name"]);
    expect(i.code).toBe("REQUIRED");
  });

  it("isSuccess and isFailure type guards", () => {
    expect(isValidationSuccess(success(1))).toBe(true);
    expect(isValidationSuccess(failure([issue("x")]))).toBe(false);
    expect(isValidationFailure(failure([issue("x")]))).toBe(true);
    expect(isValidationFailure(success(1))).toBe(false);
  });

  it("formatIssues returns a string", () => {
    const result = failure([
      issue("required", { path: ["name"] }),
      issue("invalid", { path: ["email"] }),
    ]);
    const formatted = formatIssues(result.issues);
    expect(typeof formatted).toBe("string");
    expect(formatted).toContain("name");
  });

  it("toFieldErrors groups issues by field", () => {
    const result = failure([
      issue("required", { path: ["name"] }),
      issue("invalid", { path: ["email"] }),
      issue("too short", { path: ["name"] }),
    ]);
    const fieldErrors = toFieldErrors(result.issues);
    expect(fieldErrors.name).toContain("required");
    expect(fieldErrors.email).toContain("invalid");
  });

  it("unwrap returns data from success", () => {
    const result = success("hello");
    expect(unwrapValidation(result)).toBe("hello");
  });

  it("unwrap throws on failure", () => {
    const result = failure([issue("bad")]);
    expect(() => unwrapValidation(result)).toThrow();
  });

  it("map transforms success data", () => {
    const result = map(success(5), (n) => n * 2);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(10);
    }
  });

  it("map passes through failure", () => {
    const result = map(failure([issue("bad")]), (n: number) => n * 2);
    expect(result.success).toBe(false);
  });

  it("combine merges multiple results", () => {
    const results = [success(1), success(2), success(3)];
    const combined = combine(results);
    expect(combined.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ValidationError
// ---------------------------------------------------------------------------

describe("ValidationError", () => {
  it("creates a validation error", () => {
    const err = new ValidationError("invalid", [issue("bad")]);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("invalid");
    expect(err.issues).toHaveLength(1);
    expect(err.validationCode).toBe(ValidationErrorCode.UNKNOWN);
  });

  it("isValidationError type guard", () => {
    const err = new ValidationError("x");
    expect(isValidationError(err)).toBe(true);
    expect(isValidationError(new Error("x"))).toBe(false);
  });

  it("toValidationError wraps unknown errors", () => {
    const err = toValidationError("something");
    expect(err).toBeInstanceOf(ValidationError);
  });

  it("SchemaValidationError extends ValidationError", () => {
    const err = new SchemaValidationError("schema", [issue("bad")]);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.validationCode).toBe(ValidationErrorCode.SCHEMA_FAILED);
  });

  it("ConstraintValidationError extends ValidationError", () => {
    const err = new ConstraintValidationError("constraint", [issue("bad")]);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.validationCode).toBe(ValidationErrorCode.CONSTRAINT_FAILED);
  });

  it("has fieldErrors getter", () => {
    const err = new ValidationError("invalid", [
      issue("required", { path: ["name"] }),
    ]);
    expect(err.fieldErrors.name).toContain("required");
  });

  it("has formattedIssues getter", () => {
    const err = new ValidationError("invalid", [
      issue("required", { path: ["name"] }),
    ]);
    expect(typeof err.formattedIssues).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

describe("Schema validation", () => {
  const userSchema = z.object({
    name: z.string(),
    age: z.number(),
  });

  it("validates valid data", () => {
    const result = validate(userSchema, { name: "Alice", age: 30 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Alice");
    }
  });

  it("returns failure for invalid data", () => {
    const result = validate(userSchema, { name: 42, age: "old" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });

  it("parse throws on invalid data", () => {
    expect(() => parse(userSchema, {})).toThrow(SchemaValidationError);
  });

  it("parse returns data on valid input", () => {
    const data = parse(userSchema, { name: "Bob", age: 25 });
    expect(data.name).toBe("Bob");
  });

  it("validateAsync works", async () => {
    const result = await validateAsync(userSchema, { name: "x", age: 1 });
    expect(result.success).toBe(true);
  });

  it("parseAsync throws on invalid data", async () => {
    await expect(parseAsync(userSchema, {})).rejects.toThrow(
      SchemaValidationError,
    );
  });

  it("assertValid throws on failure", () => {
    const result = validate(userSchema, {});
    expect(() => assertValid(result)).toThrow(ValidationError);
  });

  it("assertValid does not throw on success", () => {
    const result = success({ name: "x", age: 1 });
    expect(() => assertValid(result)).not.toThrow();
  });

  it("mapZodIssues converts Zod issues", () => {
    const result = userSchema.safeParse({});
    if (!result.success) {
      const issues = mapZodIssues(result.error);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0]!.message).toBeTruthy();
    }
  });

  it("mapZodIssues respects pathPrefix", () => {
    const result = userSchema.safeParse({});
    if (!result.success) {
      const issues = mapZodIssues(result.error, ["user"]);
      expect(issues[0]!.path[0]).toBe("user");
    }
  });
});

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

describe("Parser", () => {
  const schema = z.object({ x: z.number() });

  it("creates a sync parser", () => {
    const parser = createValidationParser(schema);
    expect(parser).toBeDefined();
    expect(parser.name).toBeTruthy();
  });

  it("creates an async parser", () => {
    const parser = createAsyncValidationParser(schema);
    expect(parser).toBeDefined();
    expect(parser.name).toBeTruthy();
  });

  it("safeParse returns result", () => {
    const parser = createValidationParser(schema);
    const result = parser.safeParse({ x: 1 });
    expect(result.success).toBe(true);
  });

  it("safeParse returns failure for invalid data", () => {
    const parser = createValidationParser(schema);
    const result = parser.safeParse({ x: "not a number" });
    expect(result.success).toBe(false);
  });

  it("parse throws on invalid data", () => {
    const parser = createValidationParser(schema);
    expect(() => parser.parse({ x: "bad" })).toThrow();
  });

  it("isValid returns boolean", () => {
    const parser = createValidationParser(schema);
    expect(parser.isValid({ x: 1 })).toBe(true);
    expect(parser.isValid({ x: "bad" })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

describe("Registry", () => {
  it("creates and uses a registry", () => {
    const registry = createValidationRegistry();

    registry.register({
      name: "positiveNumber",
      schema: z.number().positive(),
    });

    const rule = registry.get("positiveNumber");
    expect(rule).toBeDefined();
    expect(rule!.name).toBe("positiveNumber");
  });

  it("validates using a registered rule", () => {
    const registry = createValidationRegistry();

    registry.register({
      name: "email",
      schema: z.string().email(),
    });

    const result = registry.validate("email", "not-an-email");
    expect(result.success).toBe(false);
  });

  it("validates valid data", () => {
    const registry = createValidationRegistry();

    registry.register({
      name: "positive",
      schema: z.number().positive(),
    });

    const result = registry.validate("positive", 42);
    expect(result.success).toBe(true);
  });

  it("rejects duplicate rules by default", () => {
    const registry = createValidationRegistry();
    registry.register({ name: "x", schema: z.string() });
    expect(() => registry.register({ name: "x", schema: z.number() })).toThrow(
      "already registered",
    );
  });

  it("allows overwriting rules", () => {
    const registry = createValidationRegistry();
    registry.register({ name: "x", schema: z.string() });
    registry.register({ name: "x", schema: z.number() }, { overwrite: true });
    const rule = registry.get("x");
    expect(rule).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Composer
// ---------------------------------------------------------------------------

describe("Composer", () => {
  it("composes multiple same-type schemas", () => {
    const schema = composeSchemas(z.string().min(1), z.string().max(100));

    const result = validate(schema, "hello");
    expect(result.success).toBe(true);
  });

  it("composeSchemas rejects empty schemas", () => {
    expect(() => composeSchemas()).toThrow("At least one schema");
  });

  it("fails when composed schema rejects", () => {
    const schema = composeSchemas(z.string().min(1), z.string().max(5));

    const result = validate(schema, "too long string here");
    expect(result.success).toBe(false);
  });

  it("all() composes with constraints", () => {
    const step = all(
      schemaStep(z.string()),
      constraintStep({
        name: "notEmpty",
        validate: (v: string) => v.length > 0,
        message: "must not be empty",
        code: "NOT_EMPTY",
      }),
    );

    const result = step("hello");
    expect(result.success).toBe(true);
  });

  it("all() fails when constraint fails", () => {
    const step = all(
      schemaStep(z.string()),
      constraintStep({
        name: "notEmpty",
        validate: (v: string) => v.length > 0,
        message: "must not be empty",
        code: "NOT_EMPTY",
      }),
    );

    const result = step("");
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Transformer
// ---------------------------------------------------------------------------

describe("Transformer", () => {
  it("creates a transformer", () => {
    const transformer = createValidationTransformer((s: string) =>
      s.toUpperCase(),
    );

    expect(transformer).toBeDefined();
    expect(transformer.name).toBeTruthy();
  });

  it("validateAndTransform works", () => {
    const result = validateAndTransform(z.string(), "hello", (s: string) =>
      s.toUpperCase(),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("HELLO");
    }
  });

  it("validateAndTransform fails on invalid input", () => {
    const result = validateAndTransform(
      z.number(),
      "not a number",
      (n: number) => n * 2,
    );
    expect(result.success).toBe(false);
  });
});
