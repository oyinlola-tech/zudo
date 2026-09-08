/**
 * ETag header utilities.
 *
 * @module httpHeaders/etag
 */

/**
 * Normalizes an ETag value by trimming whitespace.
 *
 * @param value - The raw ETag value.
 * @returns The trimmed ETag, or `undefined` if empty or undefined.
 */
export function normalizeETag(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();

  if (trimmed === "") {
    return undefined;
  }

  return trimmed;
}

/**
 * Checks if an ETag is a weak validator (prefixed with `W/`).
 *
 * @param value - The ETag value.
 * @returns `true` if the ETag is weak.
 */
export function isWeakETag(value: string | undefined): boolean {
  return normalizeETag(value)?.toLowerCase().startsWith("w/") ?? false;
}

/**
 * Strips the weak validator prefix (`W/`) from an ETag.
 *
 * @param value - The ETag value.
 * @returns The strong ETag, or `undefined` if empty or undefined.
 */
export function stripWeakETag(value: string | undefined): string | undefined {
  const normalized = normalizeETag(value);

  if (!normalized) {
    return undefined;
  }

  return normalized.replace(/^W\//i, "").trim();
}
