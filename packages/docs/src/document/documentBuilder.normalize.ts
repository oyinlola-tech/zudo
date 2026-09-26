/**
 * Input normalization for `createDocument`.
 *
 * @module document/documentBuilder.normalize
 */

/**
 * Copies a tag list. A lone string (from untyped callers or older parsed
 * frontmatter) becomes a one-item list instead of being spread into
 * one-character tags.
 */
export function toTagList(
  tags: readonly string[] | string | undefined,
): string[] | undefined {
  if (tags === undefined) return undefined;
  if (typeof tags === "string") return tags === "" ? [] : [tags];
  return [...tags];
}

/**
 * Shallow copy of `value` without the keys whose value is `undefined`, so
 * an optional field that was not supplied is absent instead of present.
 */
export function withoutUndefined<T extends object>(value: T): T {
  const copy: Record<string, unknown> = {};

  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) copy[key] = item;
  }

  return copy as T;
}
