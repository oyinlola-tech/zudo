/**
 * Round 12 regressions for @zudojs/permissions (academy finding #41).
 */

import { describe, it, expect } from "vitest";
import {
  isValidPermission,
  toPermissionString,
  InvalidPermissionError,
  type TypedPermissionString,
} from "../src/index.js";

describe("#41 a template-literal permission type is available", () => {
  it("TypedPermissionString accepts resource:action and rejects a bare word", () => {
    const ok: TypedPermissionString = "post:read";
    // @ts-expect-error a permission string needs a colon
    const bad: TypedPermissionString = "postread";
    expect(ok).toBe("post:read");
    expect(bad).toBe("postread");
  });

  it("isValidPermission narrows an unknown string", () => {
    const value: string = "billing.invoice:refund";
    if (isValidPermission(value)) {
      const typed: TypedPermissionString = value;
      expect(typed).toBe(value);
    } else {
      throw new Error("expected a valid permission");
    }
    expect(isValidPermission("post*:read")).toBe(false);
  });

  it("toPermissionString validates and brands, or throws InvalidPermissionError", () => {
    const typed: TypedPermissionString = toPermissionString("post:*");
    expect(typed).toBe("post:*");
    expect(() => toPermissionString("nope")).toThrow(InvalidPermissionError);
  });
});
