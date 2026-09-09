/**
 * @zudojs/storage — Local object storage metadata sidecar.
 *
 * `put()` accepts a content type, a cache-control directive and a user
 * metadata map. Without somewhere to keep them, `get()` and `metadata()` can
 * only ever answer `undefined`, and `put()`'s return value is an echo of its
 * own argument rather than a description of what was stored.
 *
 * Each object's attributes live in a JSON file under {@link SIDECAR_DIR},
 * mirroring the object's key. The directory is reserved: it is skipped by
 * listings and refused as an object key, so a sidecar can never be addressed
 * or overwritten as an object.
 */

import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { StorageError } from "@zudojs/errors";
import { writeAtomic } from "./localObjectStorage.write.js";

/**
 * Reserved directory holding object attributes.
 *
 * Dot-prefixed so it does not collide with a plausible key, and refused as a
 * key prefix outright by {@link assertNotReserved}.
 */
export const SIDECAR_DIR = ".zudo-object-meta";

/** Attributes persisted alongside an object's bytes. */
export interface ObjectAttributes {
  readonly contentType?: string;
  readonly cacheControl?: string;
  readonly etag?: string;
  readonly metadata?: Record<string, string>;
}

/**
 * Refuse a key that addresses the reserved metadata tree.
 *
 * @param key - The caller-supplied object key.
 * @throws {StorageError} when the key targets the sidecar directory.
 */
export function assertNotReserved(key: string): void {
  if (key === SIDECAR_DIR || key.startsWith(`${SIDECAR_DIR}/`)) {
    throw new StorageError(
      `Object key "${key}" addresses the reserved metadata directory "${SIDECAR_DIR}". Choose a key outside it.`,
      { code: "STORAGE_RESERVED_KEY", statusCode: 400 },
    );
  }
}

/** Absolute path of the sidecar file describing a key. */
export function sidecarPath(basePath: string, key: string): string {
  return join(basePath, SIDECAR_DIR, `${key}.json`);
}

/**
 * Persist an object's attributes.
 *
 * Nothing is written when the object carries no attributes worth recording,
 * so a plain `put(key, bytes)` leaves no sidecar behind.
 *
 * @param basePath - The store's absolute base directory.
 * @param key - The object key.
 * @param attributes - Attributes to record.
 */
export async function writeAttributes(
  basePath: string,
  key: string,
  attributes: ObjectAttributes,
): Promise<void> {
  const entries = Object.entries(attributes).filter(
    ([, value]) => value !== undefined,
  );

  if (entries.length === 0) {
    await removeAttributes(basePath, key);
    return;
  }

  await writeAtomic(
    sidecarPath(basePath, key),
    Buffer.from(JSON.stringify(Object.fromEntries(entries)), "utf8"),
  );
}

/**
 * Read an object's attributes.
 *
 * A missing or unreadable sidecar yields empty attributes: the object itself
 * is still perfectly readable, and failing the read would make an unrelated
 * filesystem problem look like a missing object.
 *
 * @param basePath - The store's absolute base directory.
 * @param key - The object key.
 * @returns The recorded attributes, or an empty object.
 */
export async function readAttributes(
  basePath: string,
  key: string,
): Promise<ObjectAttributes> {
  try {
    const raw = await readFile(sidecarPath(basePath, key), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as ObjectAttributes;
  } catch {
    return {};
  }
}

/** Discard an object's attributes, if any were recorded. */
export async function removeAttributes(
  basePath: string,
  key: string,
): Promise<void> {
  await rm(sidecarPath(basePath, key), { force: true });
}
