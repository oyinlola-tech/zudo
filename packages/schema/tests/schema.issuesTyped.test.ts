import { describe, expect, expectTypeOf, it } from "vitest";
import { SchemaError } from "@zudojs/errors";

import {
  arraySchema,
  isSchemaValidationError,
  objectSchema,
  stringSchema,
  unwrapSchemaResult,
  type SchemaIssue,
} from "../src/index.js";

describe("isSchemaValidationError", () => {
  it("narrows a parse() failure so issues are SchemaIssue[] without a cast", () => {
    const schema = objectSchema({ title: stringSchema().min(3) });
    let caught: unknown;
    try {
      schema.parse({ title: "ab" });
    } catch (error) {
      caught = error;
    }
    expect(isSchemaValidationError(caught)).toBe(true);
    if (!isSchemaValidationError(caught)) return;
    expectTypeOf(caught.issues).toEqualTypeOf<readonly SchemaIssue[]>();
    expect(caught.issues[0]?.path).toEqual(["title"]);
    expect(caught.issues[0]?.message).toBe("String must be at least 3 characters");
  });

  it("narrows an unwrapSchemaResult() failure", () => {
    const result = stringSchema().safeParse(42);
    expect(() => unwrapSchemaResult(result)).toThrow(SchemaError);
    try {
      unwrapSchemaResult(result);
    } catch (error) {
      expect(isSchemaValidationError(error)).toBe(true);
    }
  });

  it("rejects other errors and SchemaErrors whose issues are not schema issues", () => {
    expect(isSchemaValidationError(new Error("x"))).toBe(false);
    expect(isSchemaValidationError(null)).toBe(false);
    expect(isSchemaValidationError(new SchemaError("x", { issues: ["plain string"] }))).toBe(false);
    expect(isSchemaValidationError(new SchemaError("x"))).toBe(true);
  });
});

describe("count wording", () => {
  it("uses the singular for a limit of one", () => {
    expect(stringSchema().min(1).safeParse("").success).toBe(false);
    const r = stringSchema().min(1).safeParse("");
    if (!r.success) expect(r.issues[0]?.message).toBe("String must be at least 1 character");
    const a = arraySchema(stringSchema()).min(1).safeParse([]);
    if (!a.success) expect(a.issues[0]?.message).toBe("Array must have at least 1 item");
  });

  it("keeps the plural for other counts", () => {
    const r = stringSchema().max(2).safeParse("abcd");
    if (!r.success) expect(r.issues[0]?.message).toBe("String must be at most 2 characters");
  });
});
