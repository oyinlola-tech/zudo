/**
 * ETag comparison and list parsing utilities.
 *
 * @module httpHeaders/etagMatch
 */

import { splitHeaderValues } from "../list/httpHeaders.list.js";
import {
  isWeakETag,
  normalizeETag,
  stripWeakETag,
} from "./httpHeaders.etag.js";

/**
 * Compares two entity tags.
 *
 * @param requested - The validator the client sent (the only side on which
 *   `*` is meaningful).
 * @param current - The current representation's validator.
 * @param allowWeak - `true` (default) performs the weak comparison used by
 *   `If-None-Match`. `false` performs the strong comparison required by
 *   `If-Match` and `If-Range`: both validators must be strong *and*
 *   byte-identical, so two weak tags never match.
 * @returns `true` if the tags match under the selected comparison.
 */
export function etagMatches(
  requested: string | undefined,
  current: string | undefined,
  allowWeak: boolean = true,
): boolean {
  const left = normalizeETag(requested);

  const right = normalizeETag(current);

  if (!left || !right) {
    return false;
  }

  /*
   * The wildcard is only meaningful on the request side; accepting it from
   * the current representation would make every comparison succeed.
   */
  if (left === "*") {
    return true;
  }

  if (allowWeak) {
    return stripWeakETag(left) === stripWeakETag(right);
  }

  if (isWeakETag(left) || isWeakETag(right)) {
    return false;
  }

  return left === right;
}

/**
 * Parses a comma-separated list of ETags.
 *
 * @param value - The raw ETag list string.
 * @returns An array of trimmed ETag values.
 */
export function parseETagList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return splitHeaderValues(value).map((item) => item.trim());
}
