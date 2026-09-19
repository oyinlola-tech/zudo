/**
 * @zudojs/storage — Object key validation.
 *
 * `resolve(join(base, key))` normalises `tenantA/../tenantB/x` to
 * `tenantB/x`, which passes a containment check against the store root while
 * crossing a caller-applied prefix. Object stores such as S3 treat `..` as
 * literal characters, so code written for them is safe there and was unsafe
 * here. Keys are therefore validated segment by segment and never normalised.
 */

import { relative, sep } from "node:path";
import { StorageError } from "@zudojs/errors";

/** Separators a key segment is split on; `\` is included for Windows hosts. */
const SEGMENT_SPLIT = /[/\\]/;

/**
 * Refuse a key containing a `.`, `..` or empty path segment.
 *
 * @param key - The caller-supplied object key.
 * @throws {StorageError} `STORAGE_PATH_TRAVERSAL` for a dot segment,
 *   `STORAGE_INVALID_KEY` for an empty segment (`a//b`, `a/`).
 */
export function assertCanonicalKey(key: string): void {
  for (const segment of key.split(SEGMENT_SPLIT)) {
    if (segment === "." || segment === "..") {
      throw new StorageError(`Path traversal detected: ${key}`, {
        code: "STORAGE_PATH_TRAVERSAL",
        statusCode: 400,
      });
    }
    if (segment === "") {
      throw new StorageError(
        `Object key "${key}" contains an empty path segment.`,
        { code: "STORAGE_INVALID_KEY", statusCode: 400 },
      );
    }
  }
}

/**
 * Refuse a resolved path that lands in the reserved metadata directory.
 *
 * Checked on the path relative to the base after resolution, so no spelling
 * of the key can reach the sidecar tree.
 *
 * @param basePath - The store's absolute base directory.
 * @param resolved - The absolute path the key resolved to.
 * @param reservedDir - The reserved directory name.
 * @param key - The original key, used in the error message.
 * @throws {StorageError} `STORAGE_RESERVED_KEY`.
 */
export function assertResolvedNotReserved(
  basePath: string,
  resolved: string,
  reservedDir: string,
  key: string,
): void {
  const first = relative(basePath, resolved).split(sep)[0];
  if (first === reservedDir) {
    throw new StorageError(
      `Object key "${key}" addresses the reserved metadata directory "${reservedDir}". Choose a key outside it.`,
      { code: "STORAGE_RESERVED_KEY", statusCode: 400 },
    );
  }
}
