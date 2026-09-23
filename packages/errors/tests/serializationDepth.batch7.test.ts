/**
 * Batch-7: SerializationDepthError accepts a status override so that
 * guards over untrusted input can report a client error.
 */

import { describe, it, expect } from "vitest";
import { ErrorCode, SerializationDepthError } from "../src/index.js";

describe("BATCH7-ERR: SerializationDepthError status options", () => {
  it("defaults to an unexposed 500", () => {
    const error = new SerializationDepthError(5, 3);

    expect(error.statusCode).toBe(500);
    expect(error.expose).toBe(false);
  });

  it("accepts statusCode and expose for untrusted input", () => {
    const error = new SerializationDepthError(40, 32, {
      statusCode: 400,
      expose: true,
    });

    expect(error.statusCode).toBe(400);
    expect(error.expose).toBe(true);
    expect(error.code).toBe(ErrorCode.MAX_DEPTH_EXCEEDED);
    expect(error.depth).toBe(40);
    expect(error.maxDepth).toBe(32);
  });
});
