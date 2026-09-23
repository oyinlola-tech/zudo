/**
 * Count-and-noun formatting for human-readable messages.
 *
 * @module typeConverters/count
 */

/**
 * Formats a count with the singular or plural form of a noun, so messages
 * read "at least 1 character" rather than "at least 1 characters".
 *
 * Only an exact count of 1 (or -1) is singular; 0, fractions and everything
 * else take the plural. The plural defaults to the singular plus "s"; pass it
 * explicitly for irregular nouns.
 *
 * @example
 * formatCount(1, "character");          // "1 character"
 * formatCount(3, "item");               // "3 items"
 * formatCount(2, "entry", "entries");   // "2 entries"
 */
export function formatCount(
  count: number,
  singular: string,
  plural: string = `${singular}s`,
): string {
  return `${count} ${Math.abs(count) === 1 ? singular : plural}`;
}
