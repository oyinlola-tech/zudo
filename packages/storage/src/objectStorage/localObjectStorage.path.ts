/**
 * @zudojs/storage — Local object storage path containment.
 *
 * The store's only isolation boundary is that a key may never address a file
 * outside its base directory. `join()` alone is not enough: it normalizes `..`
 * segments but a prefix comparison against the base still admits sibling
 * directories whose names merely start with the base name.
 */

import { realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { StorageError } from "@zudojs/errors";

/** Raised when a key resolves outside the store's base directory. */
function traversal(key: string): StorageError {
  return new StorageError(`Path traversal detected: ${key}`, {
    code: "STORAGE_PATH_TRAVERSAL",
    statusCode: 400,
  });
}

/**
 * Resolve the base directory a store was constructed with.
 *
 * A relative base would make containment depend on the process working
 * directory, so it is anchored once at construction.
 *
 * @param basePath - The configured base directory.
 * @returns An absolute, normalized base path.
 */
export function resolveBasePath(basePath: string): string {
  return resolve(basePath);
}

/**
 * Test whether a resolved path is contained by a base directory.
 *
 * Uses a relative-path comparison rather than a string prefix, so
 * `/data/store-secrets` is not treated as inside `/data/store`.
 *
 * @param basePath - An absolute base directory.
 * @param candidate - An absolute candidate path.
 * @returns True when the candidate is the base itself or below it.
 */
export function isContained(basePath: string, candidate: string): boolean {
  const rel = relative(basePath, candidate);
  if (rel === "") return true;
  if (isAbsolute(rel)) return false;
  return rel !== ".." && !rel.startsWith(`..${sep}`);
}

/**
 * Resolve a storage key to an absolute path inside the base directory.
 *
 * @param basePath - An absolute base directory.
 * @param key - The caller-supplied object key.
 * @returns The absolute path the key addresses.
 * @throws {StorageError} when the key escapes the base directory.
 */
export function resolveKeyPath(basePath: string, key: string): string {
  if (typeof key !== "string" || key.length === 0) {
    throw new StorageError("Object key must be a non-empty string", {
      code: "STORAGE_INVALID_KEY",
      statusCode: 400,
    });
  }

  if (key.includes("\0")) throw traversal(key);
  if (isAbsolute(key)) throw traversal(key);

  const resolved = resolve(join(basePath, key));
  if (!isContained(basePath, resolved)) throw traversal(key);

  return resolved;
}

/**
 * Assert that a path's real location is still inside the base directory.
 *
 * The lexical check in {@link resolveKeyPath} cannot see symlinks. This
 * resolves the nearest existing ancestor and re-checks containment, so a link
 * planted inside the store cannot redirect a read or write outside it.
 *
 * @param basePath - An absolute base directory.
 * @param target - The absolute path about to be opened.
 * @param key - The original key, used in the error message.
 * @throws {StorageError} when the real path escapes the base directory.
 */
export async function assertRealPathContained(
  basePath: string,
  target: string,
  key: string,
): Promise<void> {
  let current = target;

  for (;;) {
    try {
      const real = await realpath(current);
      if (!isContained(basePath, real)) throw traversal(key);
      return;
    } catch (error) {
      if (error instanceof StorageError) throw error;
      const parent = dirname(current);
      if (parent === current) return;
      current = parent;
    }
  }
}
