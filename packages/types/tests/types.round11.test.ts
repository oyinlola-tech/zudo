import { describe, it, expect } from "vitest";
import {
  isArrayOfType,
  isFiniteNumber,
  isNonEmptyString,
} from "../src/index.js";

/** Local string guard: the package exports no bare `isString`. */
const isString = (value: unknown): value is string => typeof value === "string";

describe("TYPE-04 — isArrayOfType reads every index, including holes", () => {
  it("rejects an array of holes", () => {
    // eslint-disable-next-line no-sparse-arrays
    const sparse = new Array(3) as unknown;

    expect(isArrayOfType(sparse, isNonEmptyString)).toBe(false);
  });

  it("rejects an array with a hole between real values", () => {
    const sparse: unknown[] = ["a", "b"];
    sparse.length = 4;
    sparse[3] = "d";

    expect(isArrayOfType(sparse, isString)).toBe(false);
  });

  it("narrowing a sparse array no longer hands back undefined members", () => {
    const sparse = new Array(3) as unknown;

    if (isArrayOfType(sparse, isNonEmptyString)) {
      expect.unreachable("a sparse array must not narrow to string[]");
    }
  });

  it("still accepts dense arrays and the empty array", () => {
    expect(isArrayOfType(["a", "b"], isString)).toBe(true);
    expect(isArrayOfType([], isString)).toBe(true);
    expect(isArrayOfType([1, 2, 3], isFiniteNumber)).toBe(true);
    expect(isArrayOfType([1, "2"], isFiniteNumber)).toBe(false);
    expect(isArrayOfType("nope", isString)).toBe(false);
  });

  it("accepts an explicit undefined member when the guard allows it", () => {
    expect(
      isArrayOfType(
        [undefined, undefined],
        (item): item is undefined => item === undefined,
      ),
    ).toBe(true);
  });
});
