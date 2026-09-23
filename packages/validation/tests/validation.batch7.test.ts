/**
 * Regression tests for the batch-7 lesson-writer findings.
 */

import { describe, it, expect } from "vitest";
import { SerializationDepthError } from "@zudojs/errors";
import {
  assertDepthWithinLimit,
  assertNoCircularReference,
} from "../src/index.js";

function deepObject(levels: number): unknown {
  let value: unknown = { leaf: 1 };
  for (let index = 0; index < levels; index++) value = { n: value };
  return value;
}

function capture(fn: () => void): SerializationDepthError {
  try {
    fn();
  } catch (error) {
    return error as SerializationDepthError;
  }
  throw new Error("expected a throw");
}

describe("BATCH7-VAL-3: too-deep input is a 400 client error", () => {
  it("assertDepthWithinLimit throws an exposed 400", () => {
    const error = capture(() => assertDepthWithinLimit(deepObject(40), 32));

    expect(error).toBeInstanceOf(SerializationDepthError);
    expect(error.statusCode).toBe(400);
    expect(error.expose).toBe(true);
    expect(error.maxDepth).toBe(32);
    expect(error.message).toMatch(/depth/i);
    expect(error.message).not.toMatch(/leaf/);
  });

  it("assertNoCircularReference reports over-deep input as a 400 too", () => {
    const error = capture(() =>
      assertNoCircularReference(deepObject(600), "root", 512),
    );

    expect(error).toBeInstanceOf(SerializationDepthError);
    expect(error.statusCode).toBe(400);
    expect(error.expose).toBe(true);
  });

  it("keeps SerializationDepthError's own default at 500", () => {
    const error = new SerializationDepthError(5, 3);

    expect(error.statusCode).toBe(500);
    expect(error.expose).toBe(false);
  });
});
