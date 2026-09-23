import { describe, it, expect } from "vitest";
import {
  arraySchema,
  bigintSchema,
  booleanSchema,
  coerceNumberSchema,
  mapSchema,
  numberSchema,
  objectSchema,
  recordSchema,
  setSchema,
  stringSchema,
  tupleSchema,
  undefinedSchema,
} from "../src/index.js";
import type { Schema } from "../src/index.js";

function firstIssue(
  schema: Schema<unknown>,
  input: unknown,
): { message: string; received?: string } {
  const result = schema.safeParse(input);
  if (result.success) throw new Error("expected a failure");
  const issue = result.issues[0];
  if (issue === undefined) throw new Error("expected an issue");
  return issue;
}

describe("post-release — the received type names null, arrays and NaN", () => {
  it("object().safeParse(null) says received null", () => {
    const issue = firstIssue(objectSchema({ a: stringSchema() }), null);
    expect(issue.message).toBe("Expected object, received null");
    expect(issue.received).toBe("null");
  });

  it("object().safeParse([]) says received array", () => {
    expect(firstIssue(objectSchema({}), []).received).toBe("array");
  });

  it("array().safeParse(null) says received null", () => {
    const issue = firstIssue(arraySchema(stringSchema()), null);
    expect(issue.message).toBe("Expected array, received null");
    expect(issue.received).toBe("null");
  });

  it("string().safeParse([]) says received array", () => {
    const issue = firstIssue(stringSchema(), []);
    expect(issue.message).toBe("Expected string, received array");
    expect(issue.received).toBe("array");
  });

  it("number().safeParse(NaN) says received NaN, not number", () => {
    expect(firstIssue(numberSchema(), Number.NaN).message).toBe(
      "Expected number, received NaN",
    );
  });

  it.each([
    ["boolean", booleanSchema()],
    ["bigint", bigintSchema()],
    ["undefined", undefinedSchema()],
    ["record", recordSchema(stringSchema())],
    ["tuple", tupleSchema([stringSchema()])],
    ["Map", mapSchema(stringSchema(), stringSchema())],
    ["Set", setSchema(stringSchema())],
    ["coerced number", coerceNumberSchema()],
  ] as const)("%s schema reports null as null", (_name, schema) => {
    const issue = firstIssue(schema as Schema<unknown>, null);
    expect(issue.received).toBe("null");
    expect(issue.message).toContain("null");
  });

  it("still reports a plain typeof for other values", () => {
    expect(firstIssue(stringSchema(), 42).received).toBe("number");
    expect(firstIssue(numberSchema(), "x").received).toBe("string");
  });
});

describe("impossible dates and times say so", () => {
  it("names a well-formed but impossible value instead of blaming the format", async () => {
    const { stringSchema } = await import("../src/index.js");
    const date = stringSchema().date().safeParse("2026-02-30");
    expect(date.success).toBe(false);
    if (!date.success) expect(date.issues[0]?.message).toBe("Not a real calendar date");
    const bad = stringSchema().date().safeParse("30/02/2026");
    if (!bad.success) expect(bad.issues[0]?.message).toBe("Invalid date format");
    const time = stringSchema().time().safeParse("25:61");
    if (!time.success) expect(time.issues[0]?.message).toBe("Not a real time of day");
    const dt = stringSchema().datetime().safeParse("2026-02-30T10:00:00Z");
    if (!dt.success) expect(dt.issues[0]?.message).toBe("Not a real date and time");
  });
});
