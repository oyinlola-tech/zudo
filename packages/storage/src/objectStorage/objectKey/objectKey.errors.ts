/**
 * @zudojs/storage — Local object storage I/O error classification.
 *
 * Only "the object is not there" may be reported as a missing object. EACCES,
 * EIO or EMFILE reported as `null` would send a "create if absent" path into
 * overwriting real data and would hide disk faults.
 */

import { storageReadError } from "@zudojs/errors";

/** Error codes that mean the addressed entry does not exist as a file. */
const MISSING_CODES: ReadonlySet<string> = new Set([
  "ENOENT",
  "ENOTDIR",
  "EISDIR",
]);

/**
 * Whether an I/O error means the addressed object does not exist.
 *
 * @param error - The caught error.
 * @returns True for ENOENT, ENOTDIR and EISDIR.
 */
export function isMissingEntryError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { readonly code?: unknown }).code;
  return typeof code === "string" && MISSING_CODES.has(code);
}

/**
 * Rethrow an I/O error as a `StorageError` unless it means "missing".
 *
 * @param error - The caught error.
 * @param key - The object key being read.
 * @throws {StorageError} `STORAGE_READ`, with the original error as cause.
 */
export function rethrowUnlessMissing(error: unknown, key: string): void {
  if (isMissingEntryError(error)) return;
  throw storageReadError(key, "local", error);
}
