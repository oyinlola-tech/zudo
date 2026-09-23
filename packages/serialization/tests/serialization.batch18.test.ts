/**
 * Batch 18: who sees an oversized payload.
 *
 * `deserialize` bounds a string that arrives from outside (a request body,
 * a queue, an RPC peer), so an oversized one is the client's error: an
 * exposed 413 whose public message names only the sizes. It used to be an
 * unexposed 413 that `serializePublicError` answered with "An unexpected
 * error occurred.". `serialize` bounds output the server built itself, so
 * an oversized one stays an internal, unexposed 500.
 */

import { describe, expect, it } from "vitest";
import {
  ErrorCode,
  SerializationPayloadTooLargeError,
  serializePublicError,
} from "@zudojs/errors";
import { assertSizeWithinLimit } from "@zudojs/validation";

import { JSONSerializer } from "../src/index.js";

function thrown(run: () => unknown): SerializationPayloadTooLargeError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(SerializationPayloadTooLargeError);
    return error as SerializationPayloadTooLargeError;
  }
  throw new Error("expected a SerializationPayloadTooLargeError");
}

describe("BATCH18-SER: oversized payload exposure", () => {
  const serializer = new JSONSerializer();
  const body = JSON.stringify({ note: "x".repeat(40_000) });

  it("deserialize of untrusted input is an exposed 413 naming only the sizes", () => {
    const error = thrown(() => serializer.deserialize(body, { maxSize: 32_768 }));

    expect(error.statusCode).toBe(413);
    expect(error.expose).toBe(true);
    const response = serializePublicError(error);
    expect(response.code).toBe(ErrorCode.PAYLOAD_TOO_LARGE);
    expect(response.message).toBe(
      `Serialized payload too large: ${body.length} bytes (max: 32768)`,
    );
    expect(response.message).not.toContain("xxx");
  });

  it("serialize of server-built output stays an unexposed 500", () => {
    for (const preserveTypes of [false, true]) {
      const error = thrown(() =>
        serializer.serialize({ note: "x".repeat(40_000) }, { maxSize: 32_768, preserveTypes }),
      );
      expect(error.statusCode).toBe(500);
      expect(error.expose).toBe(false);
      expect(error.code).toBe(ErrorCode.PAYLOAD_TOO_LARGE);
      expect(serializePublicError(error).message).toBe("An unexpected error occurred.");
    }
  });

  it("the @zudojs/validation size guard over untrusted input is an exposed 413 too", () => {
    const error = thrown(() => assertSizeWithinLimit({ note: "x".repeat(40_000) }, 32_768));
    expect(error.statusCode).toBe(413);
    expect(error.expose).toBe(true);
    expect(serializePublicError(error).message).toMatch(/^Serialized payload too large: \d+ bytes \(max: 32768\)$/);
  });
});

describe("too-deep input to deserialize", () => {
  it("the preserveTypes restore walk throws an exposed 400, not a hidden 500", async () => {
    // Plain JSON is stopped earlier by the parse-level depth guard (already a
    // 400), so the restore walk is exercised directly.
    const { restoreValue } = await import("../src/serializerJson/jsonSerializer.restore.js");
    let nested: unknown = { leaf: 1 };
    for (let i = 0; i < 10; i += 1) nested = { next: nested };
    const walk = {
      transformers: { get: () => undefined },
      maxDepth: 4,
      options: {},
    } as unknown as Parameters<typeof restoreValue>[0];
    let caught: unknown;
    try {
      restoreValue(walk, nested, 0);
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ statusCode: 400, expose: true });
  });
});
