import { describe, it, expect } from "vitest";
import { SchemaError } from "@zudojs/errors";
import { stringSchema, unwrapSchemaResult } from "../src/index.js";

describe("TYPE-06 — unwrapSchemaResult throws a typed schema error", () => {
  it("throws SchemaError, not a bare Error", () => {
    const result = stringSchema().safeParse(42);

    expect(result.success).toBe(false);
    expect(() => unwrapSchemaResult(result)).toThrow(SchemaError);
  });

  it("carries the issues on the thrown error", () => {
    const result = stringSchema().safeParse(42);

    let thrown: unknown;
    try {
      unwrapSchemaResult(result);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(SchemaError);
    expect((thrown as SchemaError).issues.length).toBeGreaterThan(0);
  });

  it("still returns the data on success", () => {
    expect(unwrapSchemaResult(stringSchema().safeParse("ok"))).toBe("ok");
  });
});

describe("TYPE-07 — safeParse documents that a defect still escapes", () => {
  it("documents the rethrow rather than promising 'Never throws'", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("../src/schemaBase/schemaBase.core.ts", import.meta.url),
      "utf8",
    );

    const doc = source.slice(
      0,
      source.indexOf("public safeParse("),
    );
    const jsdoc = doc.slice(doc.lastIndexOf("/**"));

    expect(jsdoc).not.toContain("Never throws");
    expect(jsdoc).toContain("@throws");
  });

  it("safeParse still returns a failure for ordinary invalid input", () => {
    expect(stringSchema().safeParse(1).success).toBe(false);
  });
});
