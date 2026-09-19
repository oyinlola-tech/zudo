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
