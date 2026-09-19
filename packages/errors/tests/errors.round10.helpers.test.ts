/**
 * Round 10 regressions: issue redaction and message/stringify helpers.
 */

import { describe, expect, it } from "vitest";

import {
  SchemaError,
  ValidationError,
  serializeError,
} from "../src/index.js";
import {
  redactIssueValues,
  safeStringify,
  sanitizeFragment,
} from "../src/domain/shared/domainError.helpers.js";

describe("LEAF-10", () => {
  it("redacts issue values even when the error is not exposed", () => {
    const issues = [{ message: "m", field: "password", value: "hunter2" }];
    const validation = new ValidationError("bad", { expose: false, issues });
    expect(JSON.stringify(validation.toJSON())).not.toContain("hunter2");
    expect(JSON.stringify(serializeError(validation))).not.toContain("hunter2");
    expect(validation.issues[0]?.value).toBe("hunter2");

    const schema = new SchemaError("bad", {
      expose: false,
      issues: [{ message: "m", path: ["password"], received: "hunter2" }],
    } as ConstructorParameters<typeof SchemaError>[1]);
    expect(JSON.stringify(schema.toJSON())).not.toContain("hunter2");
  });
});

describe("LEAF-11", () => {
  it("does not let a __proto__ key replace the issue prototype", () => {
    const issue = JSON.parse(
      '{"message":"m","__proto__":{"polluted":true,"value":"x"}}',
    ) as Record<string, unknown>;
    const [out] = redactIssueValues([issue]) as Record<string, unknown>[];
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(out?.polluted).toBeUndefined();
    expect(out?.value).toBeUndefined();

    const error = new ValidationError("bad", {
      issues: [issue as never],
    });
    const json = error.toJSON() as unknown as { issues: Record<string, unknown>[] };
    expect(Object.getPrototypeOf(json.issues[0])).toBe(Object.prototype);
    expect(json.issues[0]?.polluted).toBeUndefined();
  });
});

describe("LEAF-13", () => {
  it("does not mark shared, non-cyclic references as circular", () => {
    const shared = { id: 1 };
    expect(safeStringify({ a: shared, b: shared })).toBe(
      '{"a":{"id":1},"b":{"id":1}}',
    );
    expect(safeStringify([shared, [shared]])).toBe('[{"id":1},[{"id":1}]]');
  });

  it("still detects real cycles", () => {
    const cyclic: Record<string, unknown> = { id: 1 };
    cyclic.self = cyclic;
    expect(safeStringify(cyclic)).toBe('{"id":1,"self":"[Circular]"}');
  });
});

describe("LEAF-14", () => {
  it("strips line separators and bidi controls", () => {
    const input = "a b‮c d‏e⁦f؜g";
    const cleaned = sanitizeFragment(input);
    expect(cleaned).toBe("a b c d e f g");
  });
});
