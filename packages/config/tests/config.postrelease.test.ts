import { describe, expect, expectTypeOf, it } from "vitest";

import { ConfigManagerValidationError, type ConfigValidationIssue } from "../src/index.js";

describe("ConfigManagerValidationError.issues", () => {
  it("is typed as ConfigValidationIssue[], so reading it needs no cast", () => {
    const issue = { path: "port", message: "Expected number" } as unknown as ConfigValidationIssue;
    const error = new ConfigManagerValidationError([issue]);
    expectTypeOf(error.issues).toEqualTypeOf<readonly ConfigValidationIssue[]>();
    expect(error.issues).toEqual([issue]);
    expect(Object.isFrozen(error.issues)).toBe(true);
  });
});
