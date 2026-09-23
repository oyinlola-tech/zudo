/**
 * Batch 18: `SerializationPayloadTooLargeError` is a client error.
 *
 * It carried statusCode 413 with `expose: false`, so `serializePublicError`
 * answered an oversized request body with "An unexpected error occurred."
 * It is now exposed by default (its message holds only the two sizes) and,
 * like `SerializationDepthError`, takes `{ statusCode?, expose? }` so an
 * oversized payload the server built itself stays hidden.
 */

import { describe, expect, it } from "vitest";

import {
  ErrorCode,
  SerializationPayloadTooLargeError,
  serializePublicError,
} from "../src/index.js";

describe("BATCH18-ERR: SerializationPayloadTooLargeError exposure", () => {
  it("is an exposed 413 whose public message names only the sizes", () => {
    const error = new SerializationPayloadTooLargeError(40_960, 32_768);

    expect(error.statusCode).toBe(413);
    expect(error.expose).toBe(true);
    expect(error.size).toBe(40_960);
    expect(error.maxSize).toBe(32_768);

    const body = serializePublicError(error);
    expect(body.message).toBe("Serialized payload too large: 40960 bytes (max: 32768)");
    expect(body.code).toBe(ErrorCode.PAYLOAD_TOO_LARGE);
    expect(body.statusCode).toBe(413);
    expect(JSON.stringify(body)).not.toContain("An unexpected error occurred.");
  });

  it("stays hidden when the caller marks the payload as server-built", () => {
    const error = new SerializationPayloadTooLargeError(40_960, 32_768, {
      statusCode: 500,
      expose: false,
    });

    expect(error.statusCode).toBe(500);
    expect(error.expose).toBe(false);
    expect(error.code).toBe(ErrorCode.PAYLOAD_TOO_LARGE);
    expect(serializePublicError(error).message).toBe("An unexpected error occurred.");
  });

  it("accepts expose alone and keeps the 413", () => {
    const error = new SerializationPayloadTooLargeError(10, 5, { expose: false });
    expect(error.statusCode).toBe(413);
    expect(error.expose).toBe(false);
  });
});
