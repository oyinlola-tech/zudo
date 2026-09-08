/**
 * @zudojs/storage — Local object storage write path.
 *
 * Collects request bodies under an explicit byte budget and commits them with
 * a temp-file rename so a crash or a concurrent write can never leave a
 * truncated object visible under a live key.
 */

import { randomBytes } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { StorageError } from "@zudojs/errors";

/** Default ceiling on a single stored object, in bytes. */
export const DEFAULT_MAX_OBJECT_BYTES = 64 * 1024 * 1024;

/**
 * Drain a byte stream into a single buffer, refusing to exceed a budget.
 *
 * @param stream - The source stream.
 * @param maxBytes - Maximum total bytes accepted.
 * @returns The collected bytes.
 * @throws {StorageError} when the stream exceeds `maxBytes`.
 */
export async function collectStream(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = stream.getReader();

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      total += value.length;
      if (total > maxBytes) {
        throw new StorageError(
          `Object exceeds the maximum size of ${maxBytes} bytes`,
          { code: "STORAGE_OBJECT_TOO_LARGE", statusCode: 413 },
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, total);
}

/**
 * Enforce the byte budget on an already-materialized payload.
 *
 * @param data - The payload.
 * @param maxBytes - Maximum accepted bytes.
 * @returns The payload as a Buffer.
 * @throws {StorageError} when the payload exceeds `maxBytes`.
 */
export function assertWithinBudget(data: Uint8Array, maxBytes: number): Buffer {
  if (data.length > maxBytes) {
    throw new StorageError(
      `Object exceeds the maximum size of ${maxBytes} bytes`,
      { code: "STORAGE_OBJECT_TOO_LARGE", statusCode: 413 },
    );
  }
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
}

/**
 * Write a buffer to a path atomically.
 *
 * The payload lands in a sibling temp file first, so the destination is only
 * ever replaced by a complete object.
 *
 * @param filePath - The destination path.
 * @param buffer - The bytes to write.
 */
export async function writeAtomic(
  filePath: string,
  buffer: Buffer,
): Promise<void> {
  const directory = dirname(filePath);
  await mkdir(directory, { recursive: true });

  const temporary = join(
    directory,
    `.${basename(filePath)}.${randomBytes(8).toString("hex")}.tmp`,
  );

  try {
    await writeFile(temporary, buffer, { flag: "wx" });
    await rename(temporary, filePath);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}
