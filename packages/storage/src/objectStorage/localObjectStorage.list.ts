/**
 * @zudojs/storage — Local object storage listing.
 *
 * Listing is key-ordered and cursor-based so `continuationToken` actually
 * advances: callers paginating on `isTruncated` make progress instead of
 * receiving the first page forever.
 */

import { readdir, stat } from "node:fs/promises";
import { join, sep } from "node:path";
import type {
  ListObjectsResult,
  ObjectMetadata,
} from "../types/storage.type.js";

/** Options accepted when listing objects. */
export interface ListOptions {
  readonly maxKeys?: number;
  readonly continuationToken?: string;
}

/** Default page size when `maxKeys` is not supplied. */
export const DEFAULT_MAX_KEYS = 1000;

/** Converts an absolute path under the base directory into an object key. */
function toKey(basePath: string, fullPath: string): string {
  return fullPath
    .slice(basePath.length + 1)
    .split(sep)
    .join("/");
}

/**
 * List stored objects under an optional key prefix.
 *
 * `maxKeys` bounds the number of returned objects, applied after directory
 * entries are filtered down to files, so a page is short only at the end of
 * the listing.
 *
 * @param basePath - The store's absolute base directory.
 * @param prefix - Optional key prefix to filter on.
 * @param options - Page size and continuation cursor.
 * @returns The page of objects and a cursor when more remain.
 */
export async function listObjects(
  basePath: string,
  prefix: string | undefined,
  options?: ListOptions,
): Promise<ListObjectsResult> {
  const maxKeys =
    options?.maxKeys !== undefined && Number.isSafeInteger(options.maxKeys)
      ? Math.max(0, options.maxKeys)
      : DEFAULT_MAX_KEYS;

  let entries: string[];
  try {
    entries = (await readdir(basePath, { recursive: true })) as string[];
  } catch {
    return { objects: [], isTruncated: false };
  }

  const keys = entries
    .map((entry) => toKey(basePath, join(basePath, entry)))
    .filter((key) => (prefix ? key.startsWith(prefix) : true))
    .filter((key) =>
      options?.continuationToken ? key > options.continuationToken : true,
    )
    .sort();

  const objects: ObjectMetadata[] = [];
  let truncated = false;

  for (const key of keys) {
    if (objects.length >= maxKeys) {
      truncated = true;
      break;
    }

    try {
      const stats = await stat(join(basePath, key));
      if (!stats.isFile()) continue;
      objects.push({ key, size: stats.size, lastModified: stats.mtime });
    } catch {
      continue;
    }
  }

  const last = objects[objects.length - 1];

  return {
    objects,
    isTruncated: truncated,
    ...(truncated && last ? { continuationToken: last.key } : {}),
  };
}
