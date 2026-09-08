import { describe, expect, it } from "vitest";

import {
  apiFailure,
  apiSuccess,
  isApiFailure,
  isApiSuccess,
} from "../src/api/result/apiResult.type.js";

import { createAPIError } from "../src/api/errors/index.js";

const error = () => createAPIError("Not found", { statusCode: 404 });

describe("apiSuccess", () => {
  it("creates a successful result", () => {
    const result = apiSuccess({ id: "1" });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ id: "1" });
  });

  it("freezes the result so it cannot be mutated into an invalid shape", () => {
    const result = apiSuccess({ id: "1" });

    expect(Object.isFrozen(result)).toBe(true);
    expect(() => {
      (result as unknown as Record<string, unknown>).ok = false;
    }).toThrow();
    expect(result.ok).toBe(true);
  });
});

describe("apiFailure", () => {
  it("creates a failed result", () => {
    const failure = error();
    const result = apiFailure(failure);

    expect(result.ok).toBe(false);
    expect(result.error).toBe(failure);
  });

  it("freezes the result", () => {
    const result = apiFailure(error());

    expect(Object.isFrozen(result)).toBe(true);
    expect(() => {
      (result as unknown as Record<string, unknown>).ok = true;
    }).toThrow();
  });
});

describe("isApiSuccess", () => {
  it("returns true for successful results", () => {
    expect(isApiSuccess(apiSuccess({ id: "1" }))).toBe(true);
  });

  it("returns false for failed results", () => {
    expect(isApiSuccess(apiFailure(error()))).toBe(false);
  });
});

describe("isApiFailure", () => {
  it("returns true for failed results", () => {
    expect(isApiFailure(apiFailure(error()))).toBe(true);
  });

  it("returns false for successful results", () => {
    expect(isApiFailure(apiSuccess({ id: "1" }))).toBe(false);
  });
});
