/**
 * @zudojs/http/httpStream — Buffer conversion, chunk size, and readable creation helpers.
 */

import { Readable } from "node:stream";

/**
 * Converts a stream chunk to a Buffer.
 *
 * An object-mode chunk is rejected rather than stringified: turning it into
 * the 15-byte text `"[object Object]"` destroys the data silently and makes
 * any byte accounting built on it meaningless.
 */
export function toBuffer(chunk: unknown): Buffer {
  if (Buffer.isBuffer(chunk)) {
    return chunk;
  }

  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk);
  }

  if (typeof chunk === "string") {
    return Buffer.from(chunk, "utf8");
  }

  if (chunk === null || chunk === undefined) {
    return Buffer.alloc(0);
  }

  throw new TypeError(
    "Stream chunk must be a Buffer, Uint8Array or string; object-mode streams are not supported.",
  );
}

/**
 * Returns the byte length of a stream chunk.
 *
 * Throws for an object-mode chunk: reporting 15 bytes for an arbitrarily
 * large object would defeat any size limit built on this function.
 */
export function getChunkSize(chunk: unknown): number {
  if (Buffer.isBuffer(chunk)) {
    return chunk.length;
  }

  if (chunk instanceof Uint8Array) {
    return chunk.byteLength;
  }

  if (typeof chunk === "string") {
    return Buffer.byteLength(chunk, "utf8");
  }

  if (chunk === null || chunk === undefined) {
    return 0;
  }

  throw new TypeError(
    "Stream chunk must be a Buffer, Uint8Array or string; object-mode streams are not supported.",
  );
}

export function toReadableStream(data: Buffer | Uint8Array | string): Readable {
  return Readable.from([data]);
}
